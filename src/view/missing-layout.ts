/*
 * The sheet's missing-layout state: the message, and the offer beside it
 * (SPEC §8's last bullet, `docs/features/layout-picker.md`).
 *
 * A module rather than a branch inside `sheet-view.ts` because it is the one
 * piece of this state that can be looked at without a workspace: the view
 * cannot be constructed outside the app (`docs/PATTERNS.md` §11), and what a
 * reader actually meets here — the message, one button, or the cold-start
 * sentence and no button — is markup, so it is drivable on its own.
 *
 * **No new class and no new CSS.** The container is the notice
 * `.sheetsmith-notice` the view already draws for every other unrenderable
 * state, and the control is a bare `<button>` so it takes Obsidian's own
 * background, hover, hit target and focus ring. Not `.sheetsmith-trigger`,
 * which is the reset bar's vocabulary and would put a semantic class on a
 * control that triggers nothing, and not a class of its own, which is
 * `docs/UI.md` §9's lookalike.
 */

import { noLayoutsMessage } from '../layouts';

/** What the sheet says, and what it can offer. */
export interface MissingLayoutOffer {
	/**
	 * The sheet's own message, kept verbatim: it names both halves of the
	 * lookup — the layout and the folder searched — and the offer goes beside
	 * it, not instead of it.
	 */
	message: string;
	/** The configured layout folder, for the sentence where there are none. */
	folder: string;
	/**
	 * Whether the folder holds any layout at all. False draws the cold-start
	 * sentence and no button, because a button opening an empty picker is a
	 * control that cannot succeed under any input.
	 */
	hasLayouts: boolean;
	/** Pressed. Opens the picker; the caller owns what a choice does. */
	onPick: () => void;
}

/**
 * Draw the state into `container`.
 *
 * The message is a `<p>` rather than the notice's own text so that the second
 * child — a button or a second sentence — reads as a separate line rather than
 * as more of the same paragraph.
 *
 * The button's visible text is its accessible name, so it carries no
 * `aria-label` (`docs/UI.md` §6), and it is always on screen rather than
 * revealed by a hover (§7).
 */
export function renderMissingLayout(
	container: HTMLElement,
	offer: MissingLayoutOffer,
): void {
	container.createDiv('sheetsmith-notice', (notice) => {
		notice.createEl('p', { text: offer.message });
		if (!offer.hasLayouts) {
			notice.createEl('p', { text: noLayoutsMessage(offer.folder) });
			return;
		}
		notice.createEl('button', { text: 'Pick another layout' }, (button) => {
			button.addEventListener('click', () => offer.onPick());
		});
	});
}
