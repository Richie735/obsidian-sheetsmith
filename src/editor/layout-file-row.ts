/*
 * The layout editor's **Layout file** row: which file the pane has open, the
 * dropdown that chooses another, and the three buttons that act on the folder or
 * on that file — start a new one, copy its bytes, and trash it.
 *
 * Split out of `layout-editor.ts`, which drew the file the pane is on *and* what
 * is in it — `docs/PATTERNS.md` §1's "and" once more, and the same move
 * `config-panel.ts`, `tree.ts` and `canvas.ts` made out of that file. The row
 * stayed behind each of those on the strength of its size alone, which is not a
 * reason §1 recognises in either direction. What made it one is the pane
 * becoming a `FileView` (`docs/features/visible-layout-files.md`): which file is
 * open is the host's now, and the editor only asks for another. So the row reads none of the
 * editor's own state — not the parsed layout, not what is on disk, not the undo
 * stacks, the selection, the regions or the pending focus. It reads the vault,
 * the folder setting and the host's file, and it asks the host to open another
 * one. `LayoutFileRowHost` is exactly that much and no more.
 *
 * **A function over a host rather than a class**, which is `tree.ts`'s shape and
 * not `ConfigPanel`'s. The panel is a class because it keeps field references
 * from one render for a read the editor makes later; this row keeps nothing
 * between renders but the module's own id counter, so an instance would be an
 * object holding its constructor's arguments.
 *
 * **What came with it: `promptForNewLayout`**, exported, because the vacant
 * state's own **New layout** button is its second caller. That button stays in
 * `layout-editor.ts`, drawn where the pane draws everything it shows with no file
 * open and no layout in the folder, and it hands over the same host.
 *
 * **What did not: `redraw`.** The host's member is the editor's wrapped one — the
 * arrow that flushes a pending edit and keeps focus — handed in the way
 * `ConfigPanelHost` is handed it, and not `LayoutEditorHost.redraw`, which skips
 * both. The trash is the one caller, where no layout is left to open.
 *
 * **And not the order.** That the row goes first in the left column, and that a
 * layout that cannot be read or edited reports *under* it, is the render's rule,
 * and it is stated at the call site: the row is how an author leaves a layout
 * they cannot edit, and a message displacing it would trap them there.
 *
 * **Its cases stayed where they were**, in `layout-editor.test.ts` and
 * `view/layout-editor-view.test.ts`, although an entry point and a reportable
 * output are what `docs/PATTERNS.md` §10 says earn a module a file of its own:
 * both drive the row through a real pane, and the harness the first one builds
 * that pane with is a test file's own rather than scaffolding a sibling can
 * import (§2), which is the same reason `config-panel.ts`'s cases stay there.
 */

import { App, Notice, Setting, TFile } from 'obsidian';
import { describedRow } from './described-row';
import { ConfirmModal } from '../ui/confirm-modal';
import { NEW_LAYOUT_LABEL, promptNewLayout } from './new-layout';
import {
	isLayoutPath,
	isResolvedLayout,
	layoutFileFor,
	listLayouts,
} from '../layouts';

/** Mints the **Layout file** row's description id; see its one use. */
let fileNoteIds = 0;

/**
 * What the row needs from the editor drawing it. Live rather than a snapshot
 * where it matters: `folder` and `layoutFile` are read when a button is pressed,
 * which is after a confirm modal for the trash, not only when the row is drawn.
 *
 * **`app` is taken whole, which its peers deliberately do not.** `TreeHost.confirm`
 * and `ConfigPanelHost.suggestNames` are commands because the inner half asks
 * for what it cannot do, and a tree or a form has no business with the vault.
 * This row's job *is* the vault: every use of `app` here — the read behind
 * **Copy layout JSON**, the trash, the folder listing, the name lookups and the
 * two modals — is a file operation the row makes for itself. As commands they
 * would be some seven pass-throughs, each an arrow that only adds `plugin.app`,
 * and the editor would be spelling the file operations again one level up,
 * which is what this module was cut out to stop.
 */
export interface LayoutFileRowHost {
	readonly app: App;
	/** The layout folder, as the settings hold it now. */
	readonly folder: string;
	/** The layout file the pane has open, or null where it has none. */
	readonly layoutFile: TFile | null;
	/** Open another layout file in this pane. */
	openLayoutFile(file: TFile): void;
	/** Rebuild both regions, flushing a pending edit first. */
	redraw(): void;
}

/**
 * The **Layout file** row: which file is open, and what acts on it.
 *
 * The options are the folder's layouts, one per name as `listLayouts` gives
 * them, **keyed by path** — the pane is bound to a file, so a path is what
 * choosing one hands the host, and it is unambiguous where a basename would
 * not be for the one option that is not in the folder.
 *
 * **That option is the open file, where the folder's lookup does not reach
 * it** — a file in another folder, a subfolder, or a `.json` a `.sheetsmith`
 * of the same name shadows. It goes first, labelled with its vault path so
 * it cannot be mistaken for a layout of the same name in the folder, and it
 * is the selected one. With no file open, nothing is selected: a `<select>`
 * whose value matches no option shows none, and choosing any option is then
 * a change the dropdown reports.
 */
export function renderLayoutFileRow(
	container: HTMLElement,
	files: TFile[],
	host: LayoutFileRowHost,
): void {
	const open = host.layoutFile;
	// With no file: after an outside delete, or a restored workspace naming
	// a layout that is gone. The pane never binds itself to a file the reader
	// did not choose, so it says what to do rather than picking one.
	const note =
		open === null
			? 'No layout is open. Choose one above.'
			: outsideNote(host.app, host.folder, open);
	const offered =
		open !== null && !files.includes(open) ? [open, ...files] : files;
	let picker: HTMLSelectElement | null = null;
	const row = new Setting(container)
		// "Layout file", not "Layout", because the tree's first row is the
		// layout and this is the file it lives in. Two adjacent rows both
		// named Layout — one choosing which one is open, one configuring the
		// one that is — would be a reader's problem, not a naming quibble.
		.setName('Layout file')
		.addDropdown((dropdown) => {
			for (const file of offered) {
				dropdown.addOption(
					file.path,
					files.includes(file) ? file.basename : file.path,
				);
			}
			// **Nouns only.** Creating a layout used to be two options in
			// here — `New layout…` and `Import a layout…` — and the row rule
			// that put them there is genuine but does not reach them: the
			// dropdown answers *which layout is open* and the row's buttons
			// *act on* the one that is, and create does neither. It acts on
			// the **folder**, which is a third kind of thing, and it was
			// filed here by a side effect ("it ends with a different layout
			// open") rather than by what it is. Delete is the tell that the
			// partition was already leaking: it ends with a different layout
			// open too, and it is correctly a button
			// (`docs/features/starting-a-new-layout.md`).
			dropdown.setValue(open?.path ?? '');
			dropdown.selectEl.dataset.sheetsmithFocus = 'layout-picker';
			picker = dropdown.selectEl;
			dropdown.onChange((value) => {
				const chosen = offered.find((file) => file.path === value);
				if (chosen) host.openLayoutFile(chosen);
			});
		})
		.addButton((button) =>
			button
				// Not a CTA: creating a layout is not this pane's primary
				// action. A plain button on a row of dropdowns is the **Add
				// component** row's own precedent, and it goes before the
				// two icon buttons so the irreversible one stays last.
				.setButtonText(NEW_LAYOUT_LABEL)
				.onClick(() => promptForNewLayout(host)),
		)
		.addExtraButton((button) =>
			button
				// Before the trash rather than after it, so the one
				// irreversible control on the row stays last: a press that
				// lands one control off its mark then hits the harmless one.
				.setIcon('copy')
				.setTooltip('Copy layout JSON')
				.onClick(() => void copyLayoutJson(container, host)),
		)
		.addExtraButton((button) =>
			button
				.setIcon('trash')
				.setTooltip('Delete layout')
				.onClick(() => {
					// The open file, whatever folder it is in: the trash acts
					// on what the pane shows, never on a lookup by name.
					const file = host.layoutFile;
					if (!file) return;
					new ConfirmModal(
						host.app,
						`Delete the layout "${file.basename}"? Character notes are not touched, but the layout's components and formulas are gone.`,
						'Delete layout',
						() => void deleteLayout(file, host),
					).open();
				}),
		);

	/*
	 * What the pane has to say about the file itself — that no character can
	 * use it from where it is, or that no file is open — as the row's own
	 * description, under its controls (`editor/described-row.ts`, `docs/UI.md`
	 * §9). A line of its own between two rows read as the *next* row's: it sat
	 * 12px under this card and 3px over the one below, at the card's outer
	 * edge rather than its text. Inside the row it takes the row's inset and
	 * groups with the dropdown it is about, and the dropdown is described by
	 * it for a screen reader too.
	 *
	 * The id is per render and per pane, because two panes on one layout is a
	 * supported state and a repeated id would describe one pane's dropdown by
	 * the other's line.
	 */
	if (note !== null && picker !== null) {
		const described = describedRow(
			row,
			`sheetsmith-layout-file-note-${++fileNoteIds}`,
			() => note,
		);
		described.describes(picker);
		described.describe('');
	}
}

/**
 * Put the open layout's own bytes on the clipboard
 * (`docs/features/layout-import-export.md`).
 *
 * **The file's bytes, not a re-serialisation of them.** A layout carrying a
 * key this version's parser does not know would have it silently dropped by
 * a parse-then-serialise round trip, which is the one thing a share must not
 * do — and a layout that will not parse at all is exportable on purpose,
 * since handing the broken file to somebody who can read it is a reasonable
 * thing to want. Nothing is written anywhere, so there is no writer here for
 * the one-writer-one-spelling rule to be about.
 *
 * **It guards rather than disabling.** With no layout selected — a vault
 * whose folder holds none — this returns silently, which is `deleteLayout`'s
 * existing spelling one control to the right. Disabling it would look
 * identical to a live control (`setDisabled` reaches no paint for a
 * `.clickable-icon`) and would make this the fifth member of a
 * `docs/BACKLOG.md` row waiting on one decision about four.
 *
 * The clipboard comes off the container's own window rather than the global
 * one, which is `docs/PATTERNS.md` §5: a pane may be rendered into a popout.
 */
async function copyLayoutJson(
	container: HTMLElement,
	host: LayoutFileRowHost,
): Promise<void> {
	// The open file, never a lookup by name — which is what makes a layout
	// opened from outside the folder copyable too.
	const file = host.layoutFile;
	if (!file) return;
	let text: string;
	try {
		text = await host.app.vault.read(file);
	} catch (error) {
		// The vault's own reason: the file was trashed or renamed under a
		// pane that has not redrawn yet.
		new Notice(error instanceof Error ? error.message : String(error));
		return;
	}
	try {
		await container.win.navigator.clipboard.writeText(text);
	} catch {
		/*
		 * Deliberately the same words `src/editor/copyable-name.ts` gives,
		 * and deliberately not the same code. The argument is here rather
		 * than cited, because that file's header does not make it: it argues
		 * only why the module exists at all, and says nothing about the
		 * clipboard write or about this sentence.
		 *
		 * `copyableName` exports a builder for a `<code>` control with the
		 * copy bound inside it, so a settings-row button cannot reach the
		 * write without splitting the function in two — which is a change to
		 * a shipped control for the benefit of one caller.
		 *
		 * And only half of what such a module would hold is actually common:
		 * this failure sentence is shared, while the success sentences are
		 * not — a chip says `Copied "x"` about a name, and this says
		 * `Copied "x" to the clipboard.` about a file. So the shared thing is
		 * one short sentence rather than the gesture, which `docs/PATTERNS.md`
		 * §1's one-step tier would extract on a second consumer if the
		 * *whole* policy were shared. **A third caller is where that gets
		 * revisited**, and it is the honest cost of two copies until then.
		 */
		new Notice('Could not copy to the clipboard.');
		return;
	}
	// The layout is named because the row can only show one at a time and a
	// bare "Copied." leaves a reader wondering which; "to the clipboard" is
	// the half that says where, in the failure sentence's own words.
	new Notice(`Copied "${file.basename}" to the clipboard.`);
}

/**
 * Trash the open layout, and end with a different one open (SPEC §7).
 *
 * The trash itself is what lets the pane go of the file: the vault's
 * `delete` reaches the view, which unbinds it without writing anything to a
 * file that is gone. What is left here is the shipped ending — the first
 * layout the folder still holds, in this same leaf, or the vacant state where
 * none is left. A delete from *outside* the pane does not come here and does
 * not pick one: the reader did not ask for another layout.
 */
async function deleteLayout(
	file: TFile,
	host: LayoutFileRowHost,
): Promise<void> {
	await host.app.fileManager.trashFile(file);
	const next = listLayouts(host.app, host.folder).find(
		(candidate) => candidate !== file,
	);
	if (next) host.openLayoutFile(next);
	else host.redraw();
}

/**
 * Ask what a new layout starts from, and open whatever lands.
 *
 * **No cancel arm**, which is the whole of what moving this off the dropdown
 * bought: a sentinel option left the `<select>` showing the wrong value, so
 * both prompts used to take an `onCancel` that redrew the pane purely to
 * snap it back. A button press changes no `<select>` value, so cancelling
 * now leaves the pane exactly as it was.
 *
 * The pane hands over the layout it has open, which is what **Layout to
 * copy** prefills to, and a basename rather than the layout it holds in
 * memory: `startLayout` reads the source's file, so a copy cannot differ
 * from what is on disk (`docs/features/starting-a-new-layout.md`).
 */
// Named apart from the module function it calls: a function and an import
// spelled the same read as recursion at a glance.
export function promptForNewLayout(host: LayoutFileRowHost): void {
	const folder = host.folder;
	const open = host.layoutFile;
	promptNewLayout(
		host.app,
		folder,
		// A basename only where it names a layout the copy list offers: a
		// file outside the folder is not one, and the modal falls back.
		open !== null && isResolvedLayout(host.app, folder, open)
			? open.basename
			: null,
		(name) => {
			// What `createLayout` just wrote, resolved the way every name is
			// — which is the `.sheetsmith` it wrote, since it refuses a name
			// either extension already holds.
			const created = layoutFileFor(host.app, folder, name);
			if (created) host.openLayoutFile(created);
		},
	);
}

/**
 * Why no character can use the open file, or null where one can.
 *
 * Two reasons, and they read differently because the fixes differ. A file
 * outside the folder — another folder, or a subfolder of it, since lookup is
 * by name in the one folder — is fixed by moving it. A `.json` in the folder
 * that a `.sheetsmith` of the same name outvotes is not fixed by moving
 * anything: the folder already answers that name with the other file.
 */
function outsideNote(app: App, folder: string, file: TFile): string | null {
	if (isResolvedLayout(app, folder, file)) return null;
	const winner = layoutFileFor(app, folder, file.basename);
	if (winner !== null && isLayoutPath(file.path, folder)) {
		return `"${folder}" uses "${winner.name}" under this name, so no character can use this file.`;
	}
	return `This file is not in "${folder}", so no character can use it from here. Move it into that folder to use it.`;
}
