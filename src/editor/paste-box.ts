/*
 * The box a component is pasted through where the clipboard cannot be read
 * (`docs/features/component-copy-paste.md` §7).
 *
 * **It opens because a read failed, never because of the platform.** The menu's
 * **Paste** reads the clipboard with `readText`, which a mobile webview may not
 * offer and a desktop may refuse; where it does, the reader still holds the
 * text somewhere they can paste from, so this gives them a place to put it
 * rather than dropping the feature there. A device where the read works never
 * sees it — no `Platform.isMobile` here — and Mod+V never needs it, since a
 * `paste` event hands its text over without asking.
 *
 * The **New layout** modal's **Pasted JSON** row, rebuilt rather than reused:
 * that row is a private method of `NewLayoutModal` (`new-layout.ts`'s header
 * says why it folded in), so what carries over is its shape — a `Setting`
 * holding a six-row textarea, and a button that stays disabled while the box is
 * blank. It lives beside its one consumer on `NameModal`'s precedent, and draws
 * nothing but Obsidian's own chrome.
 *
 * **A refusal keeps the box open with its text**, under the textarea through
 * `field-error.ts`'s line: the text is what the reader would otherwise have to
 * find and paste again, and a wrong one is corrected in the box already on
 * screen.
 */

import { App, ButtonComponent, Modal, Setting, TextAreaComponent } from 'obsidian';
import { showFieldError } from './field-error';

/** The focus token the textarea's refusal line is keyed on. */
const BOX_TOKEN = 'paste-box';

export class PasteBoxModal extends Modal {
	private text = '';
	private area: TextAreaComponent | null = null;
	private button: ButtonComponent | null = null;

	/**
	 * `paste` runs the same paste the menu would have, from its second step,
	 * with the box's text, and answers the refusal to show or null where it
	 * landed — which closes the box.
	 */
	constructor(
		app: App,
		private readonly paste: (text: string) => string | null,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText('Paste a component');
		new Setting(this.contentEl)
			.setName('Copied component')
			.setDesc(
				'The clipboard could not be read on this device, so paste the copied component here. It is checked before anything is written.',
			)
			.addTextArea((area) => {
				this.area = area;
				area.setPlaceholder('Paste the copied component here');
				area.inputEl.rows = 6;
				area.inputEl.dataset.sheetsmithFocus = BOX_TOKEN;
				area.onChange((value) => {
					this.text = value;
					this.button?.setDisabled(value.trim() === '');
				});
				area.inputEl.focus();
			});
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) => {
				this.button = button;
				button
					.setButtonText('Paste')
					.setCta()
					.setDisabled(true)
					.onClick(() => this.attempt());
			});
	}

	private attempt(): void {
		if (this.text.trim() === '') return;
		const refusal = this.paste(this.text);
		if (refusal === null) {
			this.close();
			return;
		}
		if (this.area !== null) showFieldError(this.area.inputEl, refusal);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
