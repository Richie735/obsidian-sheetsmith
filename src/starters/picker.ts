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
import { InstallResult, installLayoutSource } from '../layouts';
import { Starter, STARTERS } from './index';

/**
 * Validate a starter and write it into the layout folder.
 *
 * **The validated write itself is `installLayoutSource` in `src/layouts.ts`**,
 * beside the folder it writes to, because the ordering it holds — parse the
 * source, and only then create the file — is the guarantee that a refusal
 * leaves the vault untouched, and a pasted layout needs the identical
 * guarantee (`docs/features/layout-import-export.md`). What is left here is
 * what makes a *starter* a source: its bundled object, stringified.
 *
 * **The bytes are not copied**, which is worth keeping beside the catalog:
 * a starter gone stale against the schema is refused loudly rather than
 * landing broken, and what reaches the vault is what `serialiseLayout` says.
 * The tree's own files are pinned canonical by `index.test.ts`, so in practice
 * the bytes *are* the file a reviewer read; that is discipline rather than a
 * promise the layout format makes (`parse/layout.ts` — Constraint 3 is about
 * character notes).
 *
 * No name override is passed: a starter's name is the catalog's, and a taken
 * one is refused rather than renamed on the user's behalf.
 */
export async function installStarter(
	app: App,
	folder: string,
	starter: Starter,
): Promise<InstallResult> {
	return installLayoutSource(app, folder, JSON.stringify(starter.source));
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
