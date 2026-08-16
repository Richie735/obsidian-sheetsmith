/*
 * A confirmation before something that cannot simply be typed back.
 *
 * Shared by the layout editor, where deleting a layout or removing a
 * component is the irreversible half, and by the sheet, where applying a
 * reset trigger (SPEC §6) rewrites several sections at once. One modal so the
 * two read alike: the same button order, the same warning treatment, and the
 * message carrying what is about to happen rather than "are you sure?".
 */

import { App, Modal, Setting } from 'obsidian';

export class ConfirmModal extends Modal {
	private message: string;
	private cta: string;
	private onConfirm: () => void;

	constructor(app: App, message: string, cta: string, onConfirm: () => void) {
		super(app);
		this.message = message;
		this.cta = cta;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		this.contentEl.createEl('p', { text: this.message });
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close()),
			)
			.addButton((button) => {
				button.setButtonText(this.cta).onClick(() => {
					this.close();
					this.onConfirm();
				});
				// setDestructive needs Obsidian 1.13; the class works on 1.9.
				button.buttonEl.addClass('mod-warning');
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
