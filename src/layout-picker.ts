/*
 * Choosing one of the vault's layouts (`docs/features/layout-picker.md`).
 *
 * One modal with two callers — the **Create a character** command, and the
 * missing-layout state in sheet view — which is why it is here beside
 * `layouts.ts` rather than beside either of them: the two consumers live in two
 * different folders, so there is no "beside" that is not arbitrary.
 * `starters/picker.ts` keeps its modal next to its one caller for the same rule
 * read the other way (`docs/PATTERNS.md` §1).
 *
 * No sheet UI and no CSS: the picker is Obsidian's own `SuggestModal`, so
 * `docs/UI.md`'s vocabulary and the `.sheetsmith-view` scope are untouched.
 */

import { SuggestModal, TFile } from 'obsidian';
import { listLayouts } from './layouts';
import type SheetsmithPlugin from './main';

/**
 * The vault's layouts, offered by name.
 *
 * **A row is the layout's name and nothing else.** The starter picker carries a
 * second line because its three bundled names are deliberately alike; a vault's
 * layouts are named by the user, so the name is the fact they chose in order to
 * tell them apart. There is nothing else to show either: a layout's component
 * count or its column count would cost a read and a parse of every file in the
 * folder, on open.
 *
 * **A layout whose JSON will not parse is still listed**, because filtering it
 * out would hide a file the user has and name nothing. Pick it and the sheet
 * reports the parser's own message in place (`docs/UI.md` §10), which is where
 * the failure is and where the fix is.
 */
class LayoutModal extends SuggestModal<TFile> {
	/**
	 * The candidates, read once when the modal opens rather than per keystroke.
	 *
	 * `listLayouts` is a folder lookup, a filter and a sort, and a modal is a
	 * transient surface: re-reading the vault on every character typed would be
	 * a scan per keystroke for an answer that cannot change while the reader is
	 * typing into it. `starters/picker.ts` filters a fixed list for the same
	 * reason it has one.
	 */
	private readonly layouts: readonly TFile[];

	constructor(
		plugin: SheetsmithPlugin,
		private onChoose: (name: string) => void,
	) {
		super(plugin.app);
		this.layouts = listLayouts(plugin.app, plugin.settings.layoutFolder);
		// One string for both callers. A placeholder differing only by "for this
		// character" and "for this note" is copy carrying no information: the
		// reader knows which gesture they pressed.
		this.setPlaceholder('Choose a layout');
	}

	getSuggestions(query: string): TFile[] {
		const wanted = query.trim().toLowerCase();
		if (wanted === '') return [...this.layouts];
		// Over the name, because the name is all a row holds.
		return this.layouts.filter((file) =>
			file.basename.toLowerCase().includes(wanted),
		);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.createDiv({ cls: 'suggestion-title', text: file.basename });
	}

	onChooseSuggestion(file: TFile): void {
		// The basename, which is the name `loadLayout` resolves inside the
		// folder and the name a note's `sheet-layout` holds. Never the path.
		this.onChoose(file.basename);
	}
}

/**
 * Open the picker, and call `onChoose` with the chosen layout's name.
 *
 * Exported as a function rather than the class, so a caller names a gesture and
 * not a constructor and the modal stays this module's own — which is
 * `chooseStarterLayout`'s precedent exactly.
 *
 * **It hands back the modal it opened**, which nothing in the plugin reads and
 * a test does. `starters/picker.ts` splits `chooseStarter` off
 * `onChooseSuggestion` for the same reason and states it: the app calls the
 * choice handler and cannot be awaited, so a caller's *wiring* — what actually
 * happens when a row is picked — is reachable only through the instance. Left
 * unreturned, deleting the body of the callback a caller passes here changed
 * nothing that any case could see.
 *
 * **It does not check whether the folder is empty**, deliberately: the two
 * callers do, before they offer the gesture at all, because a picker over zero
 * rows is a control that cannot succeed under any input and the honest answer
 * is not to open one. Both ask `hasLayouts` and both say `noLayoutsMessage`,
 * which live together in `layouts.ts` — the predicate and the sentence are one
 * policy, and this module's job is the modal.
 *
 * Escape closes it and calls nothing, which is `SuggestModal`'s own behaviour
 * and the reason nothing is written until a row is chosen.
 */
export function pickLayout(
	plugin: SheetsmithPlugin,
	onChoose: (name: string) => void,
): LayoutModal {
	const modal = new LayoutModal(plugin, onChoose);
	modal.open();
	return modal;
}

/** The modal itself, for the cases that drive its list rather than a caller. */
export { LayoutModal };
