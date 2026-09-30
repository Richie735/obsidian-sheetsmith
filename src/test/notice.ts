/*
 * Reading and pressing the notices a test raised.
 *
 * Scaffolding, not a test case (`docs/PATTERNS.md` §2). Most notices here are a
 * sentence, and `Notice.messages` answers those; a notice carrying a link —
 * **Undo**, **Copy layout** — is built into the notice's element through
 * `ui/undo-notice.ts`'s `offerAction`, so its text is read off that element
 * and its link pressed there. One spelling of both, rather than a copy per
 * test file and per describe block: the link's class is the markup's, and a
 * rename of it should break one line here, not eight.
 */

import { Notice } from './obsidian-stub';

/** The text of the last notice raised, link included, as its reader reads it. */
export function lastNotice(): string | null | undefined {
	return Notice.instances.at(-1)?.messageEl.textContent;
}

/** The link a notice carries — the last one raised, unless told which. */
export function noticeLink(notice = Notice.instances.at(-1)): HTMLAnchorElement {
	const link = notice?.messageEl.querySelector('a.sheetsmith-notice-action');
	if (!link?.instanceOf(HTMLAnchorElement)) throw new Error('no link on that notice');
	return link;
}

/** Press the link a notice carries: **Undo**, or **Copy layout**. */
export function pressNoticeLink(notice = Notice.instances.at(-1)): void {
	noticeLink(notice).click();
}
