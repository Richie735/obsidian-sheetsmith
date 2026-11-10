/*
 * What a Stat block zone's key, heading and table columns may be
 * (`docs/features/stat-block-zones.md`, Errors and The zone editor).
 *
 * **One set of rules for two readers who phrase them differently.** The
 * component's configuration check refuses a whole layout with a sentence naming
 * the fix in the editor's words; the zone editor refuses one commit with a
 * sentence about the field the reader is in. What they must not do is disagree
 * about *what* is refused, and with each side spelling its own predicate a rule
 * added to one side only was a matter of time — a layout the editor accepted
 * and the sheet then refused, or the other way round. So the predicates are
 * here, each answering with a fault rather than a sentence, and the sentences
 * stay with their callers (`docs/PATTERNS.md` §1, the one-step tier: a
 * predicate shared is one copy).
 *
 * Beside the components rather than in `parse/`, because a name is the formula
 * language's rule (`formula/expression.ts`'s `isName`) and these are rules
 * about a layout's configuration, not about a note's bytes. On the sibling
 * allowlist in `eslint.config.mts` and in `components/isolation.test.ts`, on
 * `typed-value.ts`'s terms: in no registry, declaring no `ComponentDefinition`,
 * importing nothing from `obsidian` and touching no file. `zone-rules.test.ts`
 * drives every fault directly, since each is a value a caller turns into words.
 */

import { isName } from '../formula/expression';
import { hasLink } from '../parse/wikilink';
import { isBuiltInZone, zoneHeadingKey } from '../parse/zones';

/** Why a zone key cannot stand, against the keys the other zones hold. */
export type ZoneKeyFault = 'blank' | 'not-a-name' | 'taken';

/**
 * Whether two spellings name one zone: trimmed and without case. The one
 * spelling of that match, for the clash below, the sheet's reading of a key
 * that names a zone (a Stat block's `briefZone`) and the zone editor carrying a
 * re-key into it, so the editor never rewrites a reference the sheet would
 * read as naming another zone, or leaves one it would read as this one.
 */
export function sameZoneKey(a: string | undefined, b: string | undefined): boolean {
	return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

export function zoneKeyFault(key: string, others: readonly (string | undefined)[]): ZoneKeyFault | null {
	const trimmed = key.trim();
	if (trimmed === '') return 'blank';
	if (!isName(trimmed)) return 'not-a-name';
	if (others.some((other) => sameZoneKey(other, trimmed))) return 'taken';
	return null;
}

/** Why a body zone's heading cannot stand, and which zone it clashes with. */
export type ZoneHeadingFault =
	| { kind: 'blank' | 'line-break' | 'link' | 'no-words' }
	| { kind: 'taken'; with: string };

/**
 * A body zone's heading against the other zones'. **Built-ins are left out on
 * both sides**: their heading is the sheet's alone and is stored in no note,
 * so it can clash with nothing a note holds.
 */
export function zoneHeadingFault(
	heading: string,
	others: readonly { key?: string; heading?: string }[],
): ZoneHeadingFault | null {
	if (heading.trim() === '') return { kind: 'blank' };
	if (/[\r\n]/.test(heading)) return { kind: 'line-break' };
	if (hasLink(heading)) return { kind: 'link' };
	const normal = zoneHeadingKey(heading);
	if (normal === '') return { kind: 'no-words' };
	const clash = others.find(
		(other) => !isBuiltInZone(other.key) && zoneHeadingKey(other.heading ?? '') === normal,
	);
	return clash === undefined ? null : { kind: 'taken', with: (clash.key ?? '').trim() };
}

/** Why a table zone's column key cannot stand, against the zone's other columns. */
export type ColumnKeyFault = 'blank' | 'pipe' | 'taken';

export function columnKeyFault(key: string, others: readonly (string | undefined)[]): ColumnKeyFault | null {
	const trimmed = key.trim();
	if (trimmed === '') return 'blank';
	if (trimmed.includes('|')) return 'pipe';
	const lower = trimmed.toLowerCase();
	if (others.some((other) => (other ?? '').trim().toLowerCase() === lower)) return 'taken';
	return null;
}
