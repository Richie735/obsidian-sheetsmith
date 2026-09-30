/*
 * A commit that would rename something character notes are keyed by, refused
 * while the pane holds a layout it could not write
 * (`docs/features/unsaveable-layout.md` §2).
 *
 * The migration a rename carries must not run until the layout it migrates *to*
 * is on disk, and a failed write drops the intent — so a later save would
 * rename the label or key and migrate no note, leaving every character's
 * section under a heading the layout no longer names. The field refuses
 * instead, puts back what it held, and says why.
 *
 * A module because the gate has four callers in two field modules — **Label**,
 * a component's key field, a list's column key and its entry key — and
 * `docs/PATTERNS.md` §1 extracts the application of a policy rather than
 * leaving four spellings of it to drift.
 */

import { RenameIntent } from '../component-rename-migration';

/**
 * Refuse `intent` where `refusal` says the pane may not rename now: put
 * `restore` back in `input`, show the reason through `show`, and answer true.
 * Answers false, touching nothing, where there is no intent or no refusal.
 *
 * `refusal` is asked at the commit rather than read once at render, so the save
 * that ends the unsaved state lifts it with no rebuild of the field. Optional,
 * because a list field drawn with no pane behind it renames freely.
 */
export function refusedRename(
	intent: RenameIntent | undefined,
	refusal: (() => string | null) | undefined,
	input: HTMLInputElement,
	restore: string,
	show: (input: HTMLInputElement, message: string) => void,
): boolean {
	if (intent === undefined) return false;
	const refused = refusal?.() ?? null;
	if (refused === null) return false;
	input.value = restore;
	show(input, refused);
	return true;
}
