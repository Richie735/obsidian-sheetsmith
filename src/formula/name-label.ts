/*
 * What a published name is called (`docs/features/published-name-labels.md`).
 *
 * One job: turn the parts the walk carries into the text a surface draws, at the
 * width that surface asks for. **The only place a `NameLabel` becomes text**, so
 * no surface joins parts itself and no code reads text back out of a composed
 * string — `docs/PATTERNS.md` §1's one-step tier: one composition, and no guard
 * test has to check that copies agree. `src/name-label-sites.test.ts` refuses the
 * other half, a split or a search on the separator anywhere in `src/`.
 *
 * **Short is never derived.** A part's `short` is the author's text as typed or
 * absent, and the one fallback is `short ?? full`, where `full` is already the
 * label, or the key where there is no label. No path here truncates, abbreviates
 * or slugs anything, so a name with no `short` draws exactly its full label on
 * every surface that asks for short.
 *
 * **What a part *is* is read here too**, `entryLabel` and `authoredShort`: the
 * trim that makes a blank `short` absent, shared by every component that
 * supplies a part, because two spellings of "blank is absent" could only be
 * tested for still agreeing.
 *
 * Pure, so Constraint 5 holds.
 */

import type { LabelPart, NameLabel, ScopeEntry } from '../types';

/** The separator between the parts of a full breadcrumb, and its only spelling. */
export const BREADCRUMB = ' · ';

/** Which width a surface draws: `short` where space is the constraint, `full` everywhere else. */
export type LabelWidth = 'full' | 'short';

/** One part at a width: `short ?? full` where short is asked, `full` where full is. */
export function partText(part: LabelPart, width: LabelWidth): string {
	return width === 'short' ? (part.short ?? part.full) : part.full;
}

/**
 * A whole name at a width: its entry part alone, or the breadcrumb from the
 * component down where `component` is asked for. A bare name is its component
 * part whatever is asked, since there is nothing under it. A `column` comes last.
 */
export function nameText(
	label: NameLabel,
	width: LabelWidth,
	options: { component?: boolean } = {},
): string {
	const parts: string[] = [];
	if (label.entry === undefined || options.component === true) {
		parts.push(partText(label.component, width));
	}
	if (label.entry !== undefined) parts.push(partText(label.entry, width));
	if (label.column !== undefined) parts.push(label.column);
	return parts.join(BREADCRUMB);
}

/**
 * A column after text that has no parts: a target this layout does not
 * publish, named by what the sheet calls it. Here rather than at the caller so
 * the separator has one spelling, and so no `NameLabel` is made up for a name
 * the walk never published.
 */
export function withColumn(text: string, column: string): string {
	return [text, column].join(BREADCRUMB);
}

/**
 * Whether drawing this name at short width used an author's `short` anywhere it
 * drew, so the full form is owed in a `title` (`docs/UI.md` §6). A structural
 * test — is a `short` present on a part that is drawn — and never a comparison of
 * two strings.
 */
export function usesShort(label: NameLabel, options: { component?: boolean } = {}): boolean {
	const drawsComponent = label.entry === undefined || options.component === true;
	return (
		(drawsComponent && label.component.short !== undefined) ||
		label.entry?.short !== undefined
	);
}

/**
 * One part, from its full text and whatever the publisher said beside it: the
 * author's `short` and whether the text is the component's own word. Absent
 * members stay absent, so a part built from nothing extra is `{ full }`.
 */
export function labelPart(full: string, from: { short?: string; ownWord?: true } = {}): LabelPart {
	return {
		full,
		...(from.short === undefined ? {} : { short: from.short }),
		...(from.ownWord === true ? { ownWord: true } : {}),
	};
}

/**
 * The label of a name a component builds for itself: its fixed word, marked as
 * the component's own (`ScopeEntry.ownWord`). The two come together from here so
 * no site can set the word and forget the mark, which would draw *Maximum +10*
 * with no pool in front of it.
 */
export function ownWord(word: string): Pick<ScopeEntry, 'label' | 'ownWord'> {
	return { label: word, ownWord: true };
}

/**
 * An author's `short` as the walk carries it: the text trimmed, and absent where
 * it is not a string or holds nothing but spaces.
 */
export function authoredShort(raw: unknown): string | undefined {
	if (typeof raw !== 'string') return undefined;
	const trimmed = raw.trim();
	return trimmed === '' ? undefined : trimmed;
}

/**
 * The display text a component hands an entry it publishes, from its own
 * configuration: `label` where there is text, `short` where the author typed one,
 * and neither key where there is nothing, so the walk falls back to the key.
 */
export function entryLabel(label: string | undefined, short: unknown): Pick<ScopeEntry, 'label' | 'short'> {
	const full = label?.trim() ?? '';
	const tight = authoredShort(short);
	return {
		...(full === '' ? {} : { label: full }),
		...(tight === undefined ? {} : { short: tight }),
	};
}
