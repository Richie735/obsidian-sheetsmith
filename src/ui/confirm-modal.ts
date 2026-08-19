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
	private items: readonly string[];

	constructor(
		app: App,
		message: string,
		cta: string,
		onConfirm: () => void,
		/**
		 * The things the action will affect, one per line. A list rather than a
		 * sentence: these are read to be counted and checked, and four component
		 * names run together with commas is a sentence to parse before the
		 * question can be answered.
		 */
		items: readonly string[] = [],
	) {
		super(app);
		this.message = message;
		this.cta = cta;
		this.onConfirm = onConfirm;
		this.items = items;
	}

	onOpen(): void {
		this.contentEl.createEl('p', { text: this.message });
		if (this.items.length > 0) {
			this.contentEl.createEl('ul', { cls: 'sheetsmith-affected' }, (list) => {
				for (const item of this.items) list.createEl('li', { text: item });
			});
		}
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
