/*
 * A whole layout put on the clipboard, and what that says.
 *
 * Two callers: the **Layout file** row's copy button, which copies the file,
 * and **Copy layout** on a notice about edits the pane could not keep
 * (`docs/features/unsaveable-layout.md` §5), which copies the pane's own
 * version — raised by the editor, its view, and the vault's file events. One
 * module named for the job, so neither the row nor a notice owns the other's
 * sentence, and a view raising a notice does not reach into the row to do it.
 */

import { Notice } from 'obsidian';
import { writeClipboard } from '../ui/clipboard';
import { offerAction } from '../ui/undo-notice';

/**
 * What a copy of a whole layout says once it is on the clipboard. One sentence,
 * so the row's button and a notice's link cannot come to describe one gesture
 * differently.
 */
export function copiedLayout(basename: string): string {
	return `Copied "${basename}" to the clipboard.`;
}

/**
 * Say `sentence` about layout text the editor is letting go of, with a **Copy
 * layout** link that puts `text` on the clipboard.
 *
 * The text is the pane's own version, never the file's — the point of the link
 * is the edits the file does not hold. `duration` is `0` where this notice is
 * the only copy left, and `UNDO_TIMEOUT` where the edits are still kept.
 */
export function offerLayoutCopy(
	sentence: string,
	basename: string,
	text: string,
	duration: number,
): void {
	offerAction(
		sentence,
		'Copy layout',
		(notice) =>
			void writeClipboard(notice.messageEl.win, text).then((written) => {
				if (written) new Notice(copiedLayout(basename));
			}),
		duration,
	);
}
