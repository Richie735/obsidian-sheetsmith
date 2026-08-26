/*
 * Inline validation on a field in the layout editor.
 *
 * Both a behaviour and a policy: the behaviour is where the message is drawn
 * and how it is anchored to the one input that earned it, and the policy is
 * that invalid input is never silently swallowed and never silently lost —
 * every message goes through the caller's `errors` map, keyed by the field's
 * focus token, because the editor rebuilds the whole pane on most changes and
 * `restoreFieldErrors` can only replay what the map holds.
 *
 * A module because this was the editor's error vocabulary living in
 * `list-fields.ts`, which is `docs/PATTERNS.md` §1's other test: a file whose
 * job is "list-shaped config fields" cannot also be the home of a helper that
 * takes any input, select or textarea and has nothing list-shaped about it.
 * `reset-field.ts` made it three modules deep, which is where §1 extracts, and
 * the alternative was the next field module either importing "list fields" for
 * something with no list in it or spelling its own — drift in the one thing
 * here that must not drift.
 */

/**
 * Inline validation: mark the input and show a message under the field, or
 * clear both. Invalid input is never silently swallowed. The message is keyed
 * to the input's focus id, because several inputs may share one control and
 * each needs its own error.
 */
export function showFieldError(
	/**
	 * Any form field in the editor. A select as readily as a text input: a reset
	 * binding's trigger is chosen from a dropdown and can still be wrong — two
	 * bindings on one trigger — and that has to report where it was chosen.
	 * Nothing below needs more than dataset, classes and a parent.
	 */
	input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
	message: string | null,
	/**
	 * Where the message is remembered across a rebuild of the pane. Without it
	 * an error survives only as long as the DOM that drew it, so correcting
	 * one field silently clears the message on another.
	 */
	errors?: Map<string, string>,
): void {
	const token = input.dataset.sheetsmithFocus;
	if (errors && token !== undefined) {
		if (message === null) errors.delete(token);
		else errors.set(token, message);
	}
	input.toggleClass('sheetsmith-input-invalid', message !== null);
	const control = input.parentElement;
	if (!control) return;
	const key = input.dataset.sheetsmithFocus ?? '';
	let existing: HTMLElement | null = null;
	for (const candidate of Array.from(
		control.querySelectorAll('.sheetsmith-field-error'),
	)) {
		if (
			candidate.instanceOf(HTMLElement) &&
			candidate.dataset.sheetsmithFor === key
		) {
			existing = candidate;
			break;
		}
	}
	if (message === null) {
		existing?.remove();
		return;
	}
	if (existing) {
		existing.setText(message);
		return;
	}
	control.createDiv('sheetsmith-field-error', (el) => {
		el.dataset.sheetsmithFor = key;
		el.setText(message);
	});
}
