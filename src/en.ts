/*
 * The fixed text a user reads at more than one site, one copy of each.
 *
 * **Named `en.ts` because of the lint, not because of a locale.** The plugin has
 * one language. `obsidianmd/ui/sentence-case` reads only a string literal written
 * at a call site it knows, so a shared constant passes it unread; the plugin's
 * `sentence-case-locale-module` rule reads every string in an exported object
 * literal, but only in a file whose name says `en`, and `eslint.config.mts`
 * switches it on for this one. So a label kept here has the one copy
 * `docs/PATTERNS.md` §1 asks for and is still read for sentence case. The
 * ruling, and what the alternatives would have cost, is in §1.
 *
 * **Keep it an object literal.** The rule reads string literals inside an
 * exported object and nothing else: a bare `export const X = '…'` here passes
 * unread, and so does a template with an expression in it. Text with one site
 * stays a literal at that site, where the call-site rule reads it.
 */

export const TEXT = {
	/**
	 * The way from a keyed markdown view to its sheet: the command, the markdown
	 * view's header action and its pane menu entry (`view/open-as-sheet.ts`).
	 */
	openAsSheet: 'Open as sheet',
	/**
	 * The way back from a sheet to its note's markdown: the command, the sheet's
	 * header action and its pane menu entry (`view/sheet-view.ts`).
	 */
	openAsMarkdown: 'Open as Markdown',
} as const;
