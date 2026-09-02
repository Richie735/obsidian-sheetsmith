/*
 * What a fence entry holding a value *and the ceiling it is read against* is,
 * in bytes.
 *
 * One entry, `Uses: 2 / 3`, rather than a second key beside it. The argument is
 * `docs/features/per-record-ceiling.md`'s and belongs there; what this module
 * owes is the half that decides whether Constraint 3 holds — **the split and
 * the join are exact inverses, separator included.**
 *
 * Three rules, and each one is a byte rule rather than a meaning:
 *
 * - **The separator run is captured whole and put back verbatim.** This is
 *   `parse/fenced.ts`'s own shape one level in: its `ENTRY` regex captures the
 *   spacing around the colon precisely so a rewrite can restore it. A note
 *   spelling `2/3` and one spelling `2 / 3` each keep their own spelling when
 *   the *other* half is edited, so nothing canonicalises a note the reader did
 *   not touch.
 * - **No separator means no ceiling, and the join emits none.** `ceiling: null`
 *   is "this entry carries no `/` at all", which is what a bare number is and
 *   what clearing a ceiling goes back to — `2 /` is not a resting state this
 *   ever writes. An entry that *holds* `2 /` is a blank ceiling half, which is
 *   `ceiling: ''`, and it round-trips as itself.
 * - **A canonical ` / ` exists for one case only**: a composite this component
 *   composes where none existed. Nothing rewrites a spelling that is already
 *   in the file.
 *
 * **In `parse/` on §2's rule that a module lives in the folder naming what it
 * does.** This is note format, it imports nothing from `obsidian`, and it holds
 * no opinion about what either half *means* — a ceiling that is not a number is
 * text like any other here, and the component decides that nothing clamps to
 * it.
 *
 * **It has a test file of its own, and `docs/PATTERNS.md` §10's third exception
 * was claimed for it once and does not fit.** That exception is for a primitive
 * whose claim only exists relative to a caller — `bodyText` alone is `trim` — and
 * the three rules above are not that: which whitespace belongs to the separator,
 * when the canonical form is reached, and that an empty ceiling takes the
 * separator with it are all statable here and none of them is a standard-library
 * call. The exception was taken on the strength of the *folder* rather than of
 * the condition every one of §10's exceptions carries, which is that what the
 * module owns has to actually be driven somewhere. It was not: a caller's round
 * trip is `write(read(body))` with nothing changed, and that never reaches this
 * file, because `RecordEntry.fields` holds the note's own bytes and the identical
 * string goes back in. `bounded-entry.test.ts` records the mutation that proved
 * it.
 */

/** One entry, split at its separator. */
export interface BoundedEntry {
	/** Everything before the separator, or the whole entry where there is none. */
	value: string;
	/** Everything after it; null where the entry carries no separator at all. */
	ceiling: string | null;
	/** The separator exactly as the note spells it, empty where there is none. */
	separator: string;
}

/**
 * What a composite this module composes for the first time is spelled as.
 *
 * The reading on screen is `2 / 3`, so the bytes are too. Reached only where
 * there is no separator already in the file to preserve.
 */
const CANONICAL_SEPARATOR = ' / ';

/**
 * A value, a separator run, and a ceiling.
 *
 * Lazy on the value half so the surrounding whitespace belongs to the
 * separator, which is the group that has to come back verbatim. A split value
 * can hold no slash, so `2 / 3 / 4` is a value of `2` and a ceiling of `3 / 4` —
 * text, which behaves as no ceiling and survives untouched.
 *
 * **That is an invariant of the split and not of `withValue`, which is handed
 * whatever its caller has.** A caller passing a value that holds a slash gets an
 * entry that re-reads as a different value and a different ceiling — the
 * reader's ceiling silently stops being one. This module cannot refuse it,
 * because it has nobody to tell; the caller keeps it, and `record-set.ts`
 * declines a slash at the two inputs that could carry one, beside the note
 * reference it already declined.
 */
const BOUNDED = /^([^/]*?)([ \t]*\/[ \t]*)([\s\S]*)$/;

/** Split an entry into its value and the ceiling it is read against. */
export function splitBounded(raw: string): BoundedEntry {
	const found = BOUNDED.exec(raw);
	if (found === null) return { value: raw, ceiling: null, separator: '' };
	return {
		value: found[1] ?? '',
		ceiling: found[3] ?? '',
		separator: found[2] ?? '',
	};
}

/** Put one back together. The exact inverse of the split. */
export function joinBounded(entry: BoundedEntry): string {
	if (entry.ceiling === null) return entry.value;
	return entry.value + entry.separator + entry.ceiling;
}

/** The same entry with a new value, keeping whatever ceiling it carries. */
export function withValue(raw: string, value: string): string {
	return joinBounded({ ...splitBounded(raw), value });
}

/**
 * The same entry with a new ceiling, keeping the value beside it.
 *
 * **An empty ceiling drops the separator with it**, so a cleared one is `2` and
 * never `2 /`. That is what makes the round trip an identity in both directions
 * of the change rather than only in the one that adds.
 */
export function withCeiling(raw: string, ceiling: string): string {
	const held = splitBounded(raw);
	if (ceiling.trim() === '') return held.value;
	return joinBounded({
		value: held.value,
		ceiling,
		separator: held.ceiling === null ? CANONICAL_SEPARATOR : held.separator,
	});
}
