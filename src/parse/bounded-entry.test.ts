import { describe, expect, it } from 'vitest';
import {
	BoundedEntry,
	joinBounded,
	splitBounded,
	withCeiling,
	withValue,
} from './bounded-entry';

/*
 * `parse/bounded-entry.ts`, tested here rather than through a caller's round
 * trip — and the file exists because the exception it was first filed under
 * does not fit it.
 *
 * `docs/PATTERNS.md` §10's third exception is for a note-format primitive whose
 * "claim only exists relative to a caller": `bodyText` alone is `trim` and
 * `splitLines` alone is a split, so a test of either asserts a standard-library
 * call. That is not this module. It owns three rules a caller cannot state —
 * which whitespace belongs to the separator rather than to either half, that a
 * canonical ` / ` is reached in exactly one case, and that an empty ceiling
 * takes the separator with it — and the exception was claimed on the strength
 * of the *folder* rather than of that condition.
 *
 * **The condition is what caught it, and it is measured rather than argued.**
 * The round trip a caller drives is `write(read(body))` with nothing changed,
 * which never reaches this module at all: `RecordEntry.fields` holds the note's
 * own bytes, so the split happens *above* `read` and `writeFenced` sees an
 * identical string. Making `withCeiling` always emit the canonical separator
 * instead of the one it read passed the whole suite — and silently rewrites a
 * note spelling `Uses: 2/3` to `Uses: 2 / 3` the first time a reader touches
 * the ceiling field, which is Constraint 3 broken by exactly the drift this
 * module exists to prevent. §10's own words for that state: what the module
 * owns has to actually be driven somewhere.
 */

/**
 * The ten spellings, as bytes, which are the same ten `record-set.test.ts`
 * round-trips through the component.
 *
 * Written out rather than generated, so a spelling deleted from the list takes
 * its own coverage with it visibly.
 */
const SPELLINGS: [string, string][] = [
	['spaced', '2 / 3'],
	['bare slash', '2/3'],
	['space before', '2 /3'],
	['space after', '2/ 3'],
	['tabs around the slash', '2\t/\t3'],
	['a blank value half', ' / 3'],
	['a blank ceiling half', '2 /'],
	['a bare value', '2'],
	['a ceiling that is not a number', '2 / lots'],
	['a second slash', '2 / 3 / 4'],
];

describe('splitting an entry into a value and its ceiling', () => {
	it.each(SPELLINGS)('rejoins %s byte for byte', (_name, raw) => {
		// The whole of the module's contract: the join is the split's exact
		// inverse, separator included.
		expect(joinBounded(splitBounded(raw))).toBe(raw);
	});

	it('has ten spellings, so the list cannot quietly shrink', () => {
		expect(SPELLINGS).toHaveLength(10);
	});

	it('gives the separator run every space around the slash', () => {
		// The one rule a caller cannot state, and the one a greedy value half
		// would break: whitespace either side of the slash belongs to the
		// separator, so a rewrite of either half can put it back verbatim.
		expect(splitBounded('2  /  3')).toEqual<BoundedEntry>({
			value: '2',
			separator: '  /  ',
			ceiling: '3',
		});
		expect(splitBounded('2\t/\t3').separator).toBe('\t/\t');
		expect(splitBounded('2/3').separator).toBe('/');
	});

	it('tells no separator apart from an empty ceiling half', () => {
		// `null` is "this entry carries no slash at all", which is what a bare
		// number is and what clearing a ceiling goes back to. `''` is a slash
		// with nothing after it, which a note may hold and which round-trips as
		// itself.
		expect(splitBounded('2').ceiling).toBeNull();
		expect(splitBounded('2').separator).toBe('');
		expect(splitBounded('2 /').ceiling).toBe('');
		expect(joinBounded({ value: '2', ceiling: null, separator: ' / ' })).toBe('2');
	});

	it('splits at the first slash and leaves the rest to the ceiling', () => {
		// A value can hold no slash by construction, so a second one is part of
		// the ceiling — text, which the component treats as no ceiling and which
		// survives untouched.
		expect(splitBounded('2 / 3 / 4')).toEqual<BoundedEntry>({
			value: '2',
			separator: ' / ',
			ceiling: '3 / 4',
		});
	});

	it('reads a blank value half as a blank value', () => {
		expect(splitBounded(' / 3').value).toBe('');
		expect(splitBounded('').ceiling).toBeNull();
	});
});

describe('rewriting one half of an entry', () => {
	it.each(SPELLINGS)('keeps %s\'s ceiling and separator when the value changes', (
		_name,
		raw,
	) => {
		const held = splitBounded(raw);
		const next = withValue(raw, '9');
		const after = splitBounded(next);
		expect(after.value).toBe('9');
		expect(after.separator).toBe(held.separator);
		expect(after.ceiling).toBe(held.ceiling);
	});

	it.each(SPELLINGS)('keeps %s\'s value and separator when the ceiling changes', (
		_name,
		raw,
	) => {
		/*
		 * **The half nothing was driving.** A caller's round trip cannot reach
		 * it, and a `withCeiling` that always emitted the canonical separator
		 * passed the whole suite while rewriting every reader's `2/3` into
		 * `2 / 3` on the first press.
		 */
		const held = splitBounded(raw);
		const next = withCeiling(raw, '9');
		const after = splitBounded(next);
		expect(after.value).toBe(held.value);
		expect(after.ceiling).toBe('9');
		// The note's own spelling where it had one; the canonical form only
		// where there was no separator to preserve.
		expect(after.separator).toBe(held.ceiling === null ? ' / ' : held.separator);
	});

	it('composes the canonical form only where no separator exists', () => {
		expect(withCeiling('2', '3')).toBe('2 / 3');
		expect(withCeiling('', '3')).toBe(' / 3');
		// And never over one that does: this is the assertion the mutation above
		// fails, spelled without a loop so it names the case it is about.
		expect(withCeiling('2/3', '4')).toBe('2/4');
		expect(withCeiling('2\t/\t3', '4')).toBe('2\t/\t4');
	});

	it('drops the separator with the ceiling it held', () => {
		// So a cleared ceiling is `2` and never `2 /`, which is what makes the
		// round trip an identity in both directions of the change rather than
		// only in the one that adds.
		expect(withCeiling('2 / 3', '')).toBe('2');
		expect(withCeiling('2/3', '   ')).toBe('2');
		expect(withCeiling('2', '')).toBe('2');
		expect(withCeiling(' / 3', '')).toBe('');
	});
});
