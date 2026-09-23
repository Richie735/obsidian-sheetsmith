/*
 * Offering the `.json` → `.sheetsmith` conversion, and running it when asked
 * (`docs/features/visible-layout-files.md`).
 *
 * **The rename is offered, never run silently**, and these are the only two
 * doors to it: the **Convert JSON layout files** command, and the **Convert**
 * button on the notice shown once per load while the folder holds a `.json`
 * layout. No save, open or other gesture renames a layout. The reason is not
 * caution in general but one device in particular: a device still on an older
 * version of the plugin reads only `.json`, so once renamed files sync to it
 * every layout there shows as missing — and a reader has to be able to decide
 * when that happens.
 *
 * What a conversion *does* is `layouts.ts`'s, beside the folder it acts on;
 * this is the reader's side of it: the two surfaces, and both sentences a reader
 * is shown about the conversion — the offer and the report.
 */

import { Notice } from 'obsidian';
import {
	type ConversionResult,
	convertLegacyLayouts,
	LAYOUT_EXTENSION,
	LEGACY_EXTENSION,
	legacyLayouts,
} from './layouts';
import type SheetsmithPlugin from './main';

/**
 * What a conversion did, in the one `Notice` that reports it.
 *
 * Here beside the notice that shows it rather than beside the rename in
 * `layouts.ts`: this module owns what a reader is told about the conversion,
 * and the load offer's sentence is already here, so the two sentences about one
 * gesture sit in one place. The count of converted files leads where there is
 * one; where there is none, the sentence opens on whatever did happen rather
 * than on "Converted 0".
 */
export function conversionMessage(
	result: ConversionResult,
	folder: string,
): string {
	const { converted, skipped, failed } = result;
	if (converted === 0 && skipped === 0 && failed.length === 0) {
		return `No .${LEGACY_EXTENSION} layouts in "${folder}".`;
	}
	const parts: string[] = [];
	if (converted > 0) {
		parts.push(
			`Converted ${converted} ${converted === 1 ? 'layout' : 'layouts'} to .${LAYOUT_EXTENSION}.`,
		);
	}
	if (skipped > 0) {
		parts.push(
			`Skipped ${skipped}: "${folder}" already holds a .${LAYOUT_EXTENSION} file under the same name, so the .${LEGACY_EXTENSION} was left as it is.`,
		);
	}
	const first = failed[0];
	if (first !== undefined) {
		parts.push(
			`Could not convert ${failed.length}: ${/[.!?]$/.test(first) ? first : `${first}.`}`,
		);
	}
	return parts.join(' ');
}

/**
 * Convert every unshadowed `.json` layout in the folder, and report it in one
 * notice — including the notice that there was nothing to do, since a command
 * that visibly does nothing reads as a command that is broken.
 */
export async function convertJsonLayouts(plugin: SheetsmithPlugin): Promise<void> {
	const folder = plugin.settings.layoutFolder;
	const result = await convertLegacyLayouts(plugin.app, folder);
	new Notice(conversionMessage(result, folder));
}

/**
 * What the load notice says: how many, why it matters, and the one thing to do
 * first.
 *
 * The warning is the whole reason this is a question rather than something the
 * plugin just does, so it is in the sentence rather than behind a link.
 */
export function conversionOffer(count: number, folder: string): string {
	const held =
		count === 1
			? `1 layout in "${folder}" is still a .${LEGACY_EXTENSION} file`
			: `${count} layouts in "${folder}" are still .${LEGACY_EXTENSION} files`;
	return `${held}, which the file explorer does not show. Update Sheetsmith on your other devices before converting: an older version reads only .${LEGACY_EXTENSION} and will show every layout as missing once these sync.`;
}

/**
 * Once per load, offer the conversion where the folder holds a `.json` layout.
 *
 * **In `onLayoutReady`**, because the vault is not indexed before it: asked any
 * earlier, the folder reads empty and a reader with ten legacy layouts is told
 * nothing. **Persistent**, because it carries a control, and a control that
 * times out from under a reader reaching for it is worse than none.
 *
 * Built the way the sheet's reset undo builds its own control into a notice
 * (`view/sheet-view.ts`'s `offerUndo`): the notice's own element, a line of
 * text, and a plain `<button>` so it takes Obsidian's own styling and needs no
 * class or rule of this plugin's.
 */
export function registerConversionOffer(plugin: SheetsmithPlugin): void {
	plugin.app.workspace.onLayoutReady(() => {
		const folder = plugin.settings.layoutFolder;
		const count = legacyLayouts(plugin.app, folder).length;
		if (count === 0) return;
		const notice = new Notice('', 0);
		notice.messageEl.createSpan({ text: `${conversionOffer(count, folder)} ` });
		notice.messageEl.createEl('button', { text: 'Convert' }, (button) => {
			button.addEventListener('click', () => {
				notice.hide();
				void convertJsonLayouts(plugin);
			});
		});
	});
}
