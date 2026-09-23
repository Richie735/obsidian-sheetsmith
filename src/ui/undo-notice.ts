/*
 * A notice that says what just happened and offers to take it back.
 *
 * Two surfaces write something the reader may not have meant and answer with
 * one of these: a reset trigger on a sheet (`view/sheet-view.ts`) and a
 * component removed from the layout editor's tree
 * (`docs/features/layout-editor-tree.md` §5). Extracted on the second, on
 * `docs/PATTERNS.md` §1's one-step tier: what is shared is a timing and a
 * markup — how long the link stays pressable, and that it is an `<a>` the
 * notice's own stylesheet rule reads — and two copies of a timing could only
 * be tested for still agreeing. **The application is shared, not the number**,
 * so neither caller builds the span and the link itself.
 *
 * What each caller keeps is the sentence and what "undo" means, including the
 * guard that refuses a stale undo: the sheet compares the note's text and the
 * editor the layout's bytes, and neither is this module's to know.
 */

import { Notice } from 'obsidian';

/**
 * How long the undo stays offered. Long enough to notice the change was the
 * wrong one, short enough that it is not still sitting there once the reader
 * has moved on.
 */
export const UNDO_TIMEOUT = 12000;

/**
 * Show `sentence`, then an **Undo** link that hides the notice and runs
 * `onUndo`.
 */
export function offerUndo(sentence: string, onUndo: () => void): Notice {
	const notice = new Notice('', UNDO_TIMEOUT);
	notice.messageEl.createSpan({ text: `${sentence} ` });
	const undo = notice.messageEl.createEl('a', {
		text: 'Undo',
		cls: 'sheetsmith-undo',
	});
	undo.addEventListener('click', () => {
		notice.hide();
		onUndo();
	});
	return notice;
}
