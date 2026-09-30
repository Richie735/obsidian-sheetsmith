/*
 * A notice carrying a sentence and one action.
 *
 * Two surfaces write something the reader may not have meant and answer with
 * one of these, offering **Undo**: a reset trigger on a sheet
 * (`view/sheet-view.ts`) and a component removed from the layout editor's tree
 * (`docs/features/layout-editor-tree.md` §5). Extracted on the second, on
 * `docs/PATTERNS.md` §1's one-step tier: what is shared is a timing and a
 * markup — how long an undo stays pressable, and that the action is an `<a>`
 * the notice's own stylesheet rule reads — and two copies of a timing could
 * only be tested for still agreeing. **The application is shared, not the
 * number**, so no caller builds the span and the link itself.
 *
 * **The action is a label and a callback, not undo alone**, so a caller with
 * another way back reuses this markup rather than a copy of it. The class is
 * `sheetsmith-notice-action` for the same reason: it was `sheetsmith-undo`, and
 * a class called undo on a link that does something else is a name a reader
 * would believe.
 *
 * What each caller keeps is the sentence and what the action means, including
 * the guard that refuses a stale undo: the sheet compares the note's text and
 * the editor the layout's bytes, and neither is this module's to know.
 */

import { Notice } from 'obsidian';

/**
 * How long the undo stays offered. Long enough to notice the change was the
 * wrong one, short enough that it is not still sitting there once the reader
 * has moved on.
 */
export const UNDO_TIMEOUT = 12000;

/**
 * Show `sentence`, then a link labelled `label` that hides the notice and runs
 * `onPress`, for `duration` milliseconds (`0` keeps it until dismissed).
 *
 * **The one writer of the markup**: the span, the `<a>` and the class the
 * notice's stylesheet rule reads are spelled here and nowhere else.
 */
export function offerAction(
	sentence: string,
	label: string,
	onPress: (notice: Notice) => void,
	duration: number,
): Notice {
	const notice = new Notice('', duration);
	notice.messageEl.createSpan({ text: `${sentence} ` });
	const link = notice.messageEl.createEl('a', {
		text: label,
		cls: 'sheetsmith-notice-action',
	});
	link.addEventListener('click', () => {
		notice.hide();
		onPress(notice);
	});
	return notice;
}

/**
 * Show `sentence`, then an **Undo** link that hides the notice and runs
 * `onUndo`.
 */
export function offerUndo(sentence: string, onUndo: () => void): Notice {
	return offerAction(sentence, 'Undo', () => onUndo(), UNDO_TIMEOUT);
}
