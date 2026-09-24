/*
 * Writing text to the clipboard, and the one sentence a refused write says.
 *
 * Three callers write the clipboard — a copyable name chip, the layout file
 * row's **Copy layout JSON**, and the tree's **Copy** on a component
 * (`docs/features/component-copy-paste.md` §3) — and each says its own thing on
 * success, about a name, a file or a component. What they share is the write
 * and the failure sentence, so that is all this holds: `docs/PATTERNS.md` §1's
 * one-step tier, reached at three consumers after `layout-file-row.ts` named
 * the third as the point to revisit.
 *
 * `ui/` rather than `editor/`, on `docs/PATTERNS.md` §2's rule for that folder:
 * a generic building block that knows nothing of what it writes. The text
 * arrives as an argument and the success sentence stays with each caller, so
 * nothing here knows a name, a layout or a component exists. All three callers
 * are in `editor/` today.
 */

import { Notice } from 'obsidian';

/** What a refused write says, in the words all three callers shared already. */
export const CLIPBOARD_REFUSED = 'Could not copy to the clipboard.';

/**
 * Put `text` on the clipboard of the window a control lives in, and say so
 * when that is refused. Resolves to whether it was written, so the caller can
 * say its own success sentence and nothing on failure.
 *
 * The window is the caller's rather than the global one (`docs/PATTERNS.md`
 * §5): a pane may be rendered into a popout.
 */
export async function writeClipboard(win: Window, text: string): Promise<boolean> {
	try {
		await win.navigator.clipboard.writeText(text);
		return true;
	} catch {
		new Notice(CLIPBOARD_REFUSED);
		return false;
	}
}
