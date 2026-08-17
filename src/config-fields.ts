/*
 * Pure rules about a component's declared config fields (SPEC §4.1).
 *
 * Separate from the layout editor that renders them, and free of any
 * `obsidian` import, so the rules can be tested without launching the app —
 * the same reason `src/parse/` and `src/formula/` stay pure.
 */

import { ConfigFieldSpec } from './types';

/**
 * Whether a conditional field's controlling key holds the value it asks for.
 *
 * Compared against the *effective* value rather than the stored one. The
 * editor omits a key whose value matches its own default, so a condition
 * naming that default would never match a record and the field would be
 * hidden in exactly the case it exists to be visible in — which is what a
 * mode whose ordinary setting is the first one needs. The stored value wins
 * where there is one; otherwise the controlling field's default stands in:
 * the first option for a select, `default` for a boolean.
 *
 * A condition naming a field that does not exist is never met. A typo in a
 * component's own declaration then hides the field rather than showing it
 * unconditionally, which is the safer way to be wrong.
 */
export function conditionMet(
	condition: { key: string; equals: unknown },
	fields: readonly ConfigFieldSpec[],
	record: Record<string, unknown>,
): boolean {
	const stored = record[condition.key];
	if (stored !== undefined) return stored === condition.equals;
	const controlling = fields.find((field) => field.key === condition.key);
	if (!controlling) return false;
	const fallback =
		controlling.kind === 'select' ? controlling.options?.[0] : controlling.default;
	return fallback === condition.equals;
}
