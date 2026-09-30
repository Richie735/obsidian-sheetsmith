/*
 * A notice carrying a sentence and one action.
 *
 * The action is the reader's way back from something the plugin just did or is
 * about to lose. Three callers: a reset trigger on a sheet, which offers
 * **Undo** (`view/sheet-view.ts`); an edit from the layout editor's tree, a
 * removal or a paste, which offers **Undo** too
 * (`docs/features/layout-editor-tree.md` §5); and a layout the editor could not
 * keep, which offers **Copy layout** (`editor/layout-copy.ts`,
 * `docs/features/unsaveable-layout.md` §5). Extracted on the second, on
 * `docs/PATTERNS.md` §1's one-step tier: what is shared is a timing and a
 * markup — how long an undo stays pressable, and that the action is an `<a>`
 * the notice's own stylesheet rule reads — and two copies of a timing could
 * only be tested for still agreeing. **The application is shared, not the
 * number**, so no caller builds the span and the link itself.
 *
 * The class is `sheetsmith-notice-action`, named for the markup: it was
 * `sheetsmith-undo` while every link undid, and a class called undo on a link
 * that copies is a name a reader would believe.
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
 * **The one writer of the markup**, since the layout editor's **Copy layout**
 * is the same sentence-and-link with a different action
 * (`docs/features/unsaveable-layout.md` §5): the span, the `<a>` and the class
 * the notice's stylesheet rule reads are spelled here and nowhere else.
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
