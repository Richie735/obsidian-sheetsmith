/*
 * What a condition on a field names, read from its text alone
 * (`docs/features/conditional-field-visibility.md`).
 *
 * A Record set field may carry `visibleWhen`, a boolean formula evaluated in the
 * record's own scope. Two rules about that text are static — they need no
 * values, only the names the condition reads — and each has two readers that
 * must agree:
 *
 * - **A condition that names its own field is refused.** The component skips it
 *   and draws the field, and the layout editor reports it under the field's
 *   **Shown when**. A field that can hide itself vanishes under the cursor and
 *   can only be brought back by a reset.
 * - **Which fields a condition reads**, for the editor's position legend and its
 *   reorder report: both ask of one condition whether it reads a sibling's key.
 *
 * **One predicate, here, because the two readers may not import each other.**
 * `components/` and `editor/` may both import from `formula/` and neither from
 * the other, so a copy per caller was the only other shape — and two copies of
 * a predicate could only be tested for still agreeing (`docs/PATTERNS.md` §1's
 * one-step rung).
 *
 * **Bare names only.** `abilities.Uses` is one token and names a published
 * value elsewhere on the sheet, not the record's own `Uses`, so it does not
 * match. Case-sensitive, because the record scope is: `uses` does not read a
 * field keyed `Uses`, and a condition spelling it so fails as an unknown name.
 *
 * Tokenized, not parsed, on `nameSpans`' own terms: a condition with a stray
 * bracket still names what it names. Text that will not tokenize names
 * nothing, and the parse error is what the editor reports instead.
 */

import { nameSpans } from './expression';

/**
 * The condition a layout's `visibleWhen` holds, or null where it holds none:
 * absent, blank, or anything but text or a hand-written `true` or `false`.
 *
 * **One reading for the component and the editor**, since "does this entry
 * carry a condition at all" decides both whether a Record set evaluates one and
 * whether a Table's list reports one, and two spellings of it had already come
 * to disagree about a hand-written `3`.
 */
export function heldCondition(raw: unknown): string | boolean | null {
	if (typeof raw === 'boolean') return raw;
	if (typeof raw !== 'string' || raw.trim() === '') return null;
	return raw;
}

/** Whether a condition's text reads `key` as a bare name. */
export function conditionReads(condition: string, key: string): boolean {
	return (nameSpans(condition) ?? []).some(
		(span) => !span.call && span.text === key,
	);
}
