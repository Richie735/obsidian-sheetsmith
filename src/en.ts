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

import type { ModifierOperator } from './types';

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
	/**
	 * Why a change aimed at a level or a flag may not add to it: the sheet's row
	 * popup, the modifier form and the layout editor's definitions report all
	 * say it (`docs/features/non-number-modifiers.md` D6). The fault only: the
	 * fix names two operators by their labels, which the lint reads as words
	 * out of sentence case, so `formula/modifier-states.ts` composes it from
	 * `OPERATOR_LABELS` as `STATE_REFUSES_ADD`, the one spelling every surface
	 * shows.
	 */
	stateRefusesAdd: 'Adds to cannot change a level or a flag.',
	/**
	 * Why a change aimed at a buffer may only be an At least: the row popup, the
	 * modifier form and the layout editor's definitions report all say it
	 * (`docs/features/granted-temporary-points.md` D2). The fault only, on
	 * `stateRefusesAdd`'s terms: `formula/modifier-buffers.ts` composes the fix
	 * from `OPERATOR_LABELS` as `BUFFER_TAKES_AT_LEAST`.
	 */
	bufferRefusesOperator: 'Temporary points do not add up, so only the highest grant applies.',
	/**
	 * Why an Adds to or an At least may not choose a dropdown's option: the row
	 * popup, the modifier form and the layout editor's definitions report all
	 * say it (`docs/features/text-value-modifiers.md` D3). The faults only, on
	 * `stateRefusesAdd`'s terms: `formula/modifier-choices.ts` composes the fix
	 * from `OPERATOR_LABELS`.
	 */
	choiceRefusesAdd: 'Adds to cannot choose an option.',
	choiceRefusesAtLeast: 'At least cannot choose an option.',
	/**
	 * What a grant's amount means, under the field it is typed into: the sheet's
	 * modifier form and the layout editor's definitions field
	 * (`docs/features/granted-temporary-points.md`), in the position legend's
	 * spelling.
	 */
	grantLegend: "Whole points. The highest grant, or the pool's own, applies.",
} as const;

/**
 * What each modifier operator is called, which is what an author picks: the
 * sheet's modifier form and the layout editor's definitions list offer the
 * same three, in this order (`docs/features/character-forms.md`). A `Record`
 * over the operator, so a fourth does not compile until it has a word here, and
 * one copy so the two surfaces cannot call one operator two things. Words for
 * what an item does rather than the stored ids, which read like the engine.
 */
export const OPERATOR_LABELS: Readonly<Record<ModifierOperator, string>> = {
	add: 'Adds to',
	override: 'Sets',
	upgrade: 'At least',
};
