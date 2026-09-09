/*
 * Bringing a layout somebody sent you into the vault
 * (`docs/features/layout-import-export.md`).
 *
 * No sheet UI and no CSS: a `Modal` of `Setting` rows and a `Notice`, which is
 * Obsidian's own chrome throughout, so `docs/UI.md`'s vocabulary and the
 * `.sheetsmith-view` scope are untouched.
 *
 * **The modal lives beside its one consumer rather than in `src/ui/`**, which is
 * `ConfirmModal`'s, `NameModal`'s and `StarterModal`'s shared precedent: one
 * consumer earns no generalisation (`docs/PATTERNS.md` §1).
 *
 * **The validated write is not here.** It is `installLayoutSource` in
 * `src/layouts.ts`, beside the folder it writes to, and the whole of what this
 * module adds to it is a paste box, an optional name, and what to do with each
 * arm of the answer.
 */

import { App, ButtonComponent, Modal, Notice, Setting } from 'obsidian';
import { installLayoutSource } from '../layouts';

/**
 * Ask for a pasted layout, validate it, and write it into the layout folder.
 *
 * Exported as a function rather than the class, on `chooseStarterLayout`'s own
 * argument: the caller names a gesture and not a constructor, and the modal
 * stays this module's own.
 *
 * `onImported` is handed the name the file landed under, so the pane can open
 * it; `onCancel` fires when the modal closes without importing, which is what
 * snaps the dropdown that opened it back to the layout still on screen.
 */
export function promptImportLayout(
	app: App,
	folder: string,
	onImported: (name: string) => void,
	onCancel: () => void,
): void {
	new ImportModal(app, folder, onImported, onCancel).open();
}

class ImportModal extends Modal {
	private folder: string;
	private onImported: (name: string) => void;
	private onCancel: () => void;
	private imported = false;
	/** The paste box and the name box, as typed. */
	private source = '';
	private name = '';

	constructor(
		app: App,
		folder: string,
		onImported: (name: string) => void,
		onCancel: () => void,
	) {
		super(app);
		this.folder = folder;
		this.onImported = onImported;
		this.onCancel = onCancel;
	}

	onOpen(): void {
		this.titleEl.setText('Import a layout');
		// **No `data-sheetsmith-focus` on anything here**, and the absence is
		// deliberate: that attribute is the pane's focus-restoration vocabulary,
		// resolved by `focus-token.ts` to put an author back on the control a
		// *rebuild* replaced. A modal is built once in `onOpen` and emptied in
		// `onClose`, so nothing ever resolves one — it would be a test selector
		// wearing a production name, and the next reader could not tell which
		// tokens are live addresses. `NameModal` sets none either; a case
		// addresses these fields by their row's name, which is what a reader
		// chooses them by.

		// Held so the button can say, by being disabled, that there is nothing to
		// import yet — `NameModal`'s stated reason one file over: a live button
		// that silently does nothing on click is indistinguishable from a broken
		// one. **This control may disable where the row's copy icon may not**:
		// `docs/BACKLOG.md`'s invisible-disabled row is about `.clickable-icon`,
		// which Obsidian carries no `is-disabled` rule for, and a text button in a
		// modal is not one.
		let submit: ButtonComponent | null = null;

		new Setting(this.contentEl)
			.setName('Layout JSON')
			.addTextArea((area) => {
				// A few rows, deliberately: a real layout is 7-24KB and nobody
				// reads that in a textarea. It is a paste target, not an editor.
				area.setPlaceholder("Paste the layout's JSON here");
				area.inputEl.rows = 6;
				area.onChange((value) => {
					this.source = value;
					submit?.setDisabled(value.trim() === '');
				});
				area.inputEl.focus();
			});

		new Setting(this.contentEl)
			.setName('Name')
			// The consequence rather than a restatement (`docs/PATTERNS.md` §8):
			// what an empty box does, and the one case a reader reaches for this
			// field at all.
			.setDesc(
				'Leave empty to use the name inside the JSON. Change it here if the layout folder already holds that name.',
			)
			.addText((text) => {
				text.onChange((value) => {
					this.name = value;
				});
			});

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close()),
			)
			.addButton((button) => {
				submit = button;
				button
					.setButtonText('Import')
					.setCta()
					.onClick(() => void this.attempt());
				button.setDisabled(true);
			});
	}

	/**
	 * Try the import and say what happened.
	 *
	 * **A refusal leaves the modal open with both boxes exactly as typed**, which
	 * is the one place this departs from `StarterModal`, which closes and
	 * announces. Two reasons: the input is expensive to reproduce — a 23KB paste
	 * and a typed name — and the fix for the commonest refusal is *in the modal*,
	 * since a taken name is answered by typing a different one in the box already
	 * on screen. Nothing is rebuilt on this path, so "as typed" costs no code.
	 *
	 * A method rather than the click handler's own body because the handler
	 * cannot be `async`: the write, the refusal and the close all sit behind an
	 * await, and `void` on one call is the whole of what the button says about
	 * it.
	 */
	private async attempt(): Promise<void> {
		// The name box goes across untrimmed: what a blank one means is
		// `installLayoutSource`'s rule and stated in its header, and a `.trim()`
		// here would be a second copy of it (`docs/PATTERNS.md` §1).
		const result = await installLayoutSource(
			this.app,
			this.folder,
			this.source,
			this.name,
		);
		// `'error' in` rather than `'ok' in`, which is §4's documented spelling for
		// a two-armed result: the failure arm is the one a caller must not forget.
		if ('error' in result) {
			new Notice(result.error);
			return;
		}
		this.imported = true;
		this.close();
		new Notice(result.message);
		// The name the writer settled on, asked for rather than re-derived: the
		// pane must open the file that actually landed, and only the write knows
		// whether the box or the source decided its name.
		this.onImported(result.name);
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.imported) this.onCancel();
	}
}
