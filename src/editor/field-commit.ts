/*
 * When a text field in the editor writes what was typed into it.
 *
 * One rule, and it is a policy rather than a behaviour: on `change` — blur or
 * Enter — and never per keystroke. Every commit in the editor calls
 * `persist()`, which serialises the layout and writes the file, so binding to
 * `input` would rewrite the layout on every letter of a formula and would
 * validate half-typed expressions as it went.
 *
 * A module because the reset binding moved out of `layout-editor.ts` and became
 * its second caller. `docs/PATTERNS.md` §1 allows two copies of a *behaviour*
 * under a test that drives both, and refuses two copies of a policy on any
 * terms: drift is the whole risk, and one field committing per keystroke while
 * the rest commit on blur is exactly the drift nothing would report.
 */

import { TextComponent } from 'obsidian';

/** Commit on change (blur or Enter), never per keystroke. */
export function onCommit(
	text: TextComponent,
	handler: (value: string) => void,
): void {
	text.inputEl.addEventListener('change', () => handler(text.inputEl.value));
}
