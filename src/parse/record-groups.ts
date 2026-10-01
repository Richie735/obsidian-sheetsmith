/*
 * Arranging a list's records under headers (`docs/features/record-set-groups.md`).
 *
 * **A display arrangement over the file's order, never a reorder of it.** A
 * record's identity is its position among the note's `###` blocks, so what this
 * returns holds each record's position beside it and moves nothing: the caller
 * draws the groups in the order given and every write still addresses a record
 * by the position it has in the file.
 *
 * **It reads no value itself.** What a record is worth to the key is the
 * caller's reading, handed in, because that reading has to be the one every
 * formula already uses (`sum(spells, Level)` and a group must never disagree
 * about what a record is worth) and that lives with the component. This module
 * knows how to order, merge and place the leftovers, and nothing about what a
 * level or a number is — which is also why it imports nothing from a component
 * or from `obsidian`.
 */

/**
 * What two typed spellings must share to be one group: the value trimmed,
 * Unicode-normalised to NFC and lower-cased, and nothing else.
 *
 * **NFC because the same accented letter arrives composed or decomposed** from a
 * keyboard, a paste or a synced note, and two headers reading identically on
 * screen are the worst thing this rule could produce. **Nothing else is folded**:
 * an inner run of spaces is kept and an accent is a letter, because those are
 * typos a reader can see and a suggestion list is the answer to them, where
 * folding more would hide a difference the player may mean
 * (`docs/features/free-text-group-key.md`).
 */
export function groupMatchKey(text: string): string {
	return text.trim().normalize('NFC').toLowerCase();
}

/**
 * The match key that is the Other group's, whatever spelling typed it. Without
 * this, typing "Other" would head a second group reading the same as the real
 * one, with a collapse state of its own.
 */
const OTHER_MATCH = 'other';

/** Where a record sits among the groups: the key it shares and its place in the order. */
export interface GroupReading {
	/** The stored value as a string. Never empty, which is what `OTHER_KEY` is. */
	key: string;
	/** The place in the order, ascending. */
	order: number;
	/**
	 * The spelling this record would head a group with, where the key is not
	 * something a reader can read as it stands (a text key is lower-cased).
	 */
	label?: string;
}

/** One record, with the position the file gives it. */
export interface GroupedRecord<T> {
	record: T;
	at: number;
}

export interface RecordGroup<T> {
	/** The collapse state's key: `OTHER_KEY` for the group of records with no value. */
	key: string;
	/**
	 * The first member's spelling, in file order, so the header does not change
	 * with the order the records were edited in. Absent where no reading gave one.
	 */
	label?: string;
	/** Records in the file's order. */
	members: GroupedRecord<T>[];
}

/**
 * The key of the group a record with no reading goes under, which no reading's
 * key can be, so its collapse state cannot collide with a real group's.
 */
export const OTHER_KEY = '';

export interface GroupingOptions {
	/** Order by the key, alphabetically, instead of by each reading's `order`. */
	alphabetical?: boolean;
	/** The collator's locale; the reader's own when absent. Tests pin `en`. */
	locale?: string;
}

/**
 * Every record in exactly one group: the groups by ascending order, then the
 * records the reading had no answer for, last, whatever the size of any key.
 * Records keep the file's order inside each.
 *
 * A group is drawn when it has a record, so an empty one is never returned.
 */
export function groupRecords<T>(
	records: readonly T[],
	read: (record: T, at: number) => GroupReading | null,
	options: GroupingOptions = {},
): RecordGroup<T>[] {
	const found = new Map<string, { order: number; group: RecordGroup<T> }>();
	const other: RecordGroup<T> = { key: OTHER_KEY, members: [] };
	records.forEach((record, at) => {
		const reading = read(record, at);
		// An empty key is `OTHER_KEY`'s, so a reading that gave one is no reading:
		// it cannot start a group that collides with Other's collapse state.
		if (
			reading === null ||
			reading.key === OTHER_KEY ||
			reading.key === OTHER_MATCH
		) {
			other.members.push({ record, at });
			return;
		}
		let held = found.get(reading.key);
		if (held === undefined) {
			held = {
				order: reading.order,
				group:
					reading.label === undefined
						? { key: reading.key, members: [] }
						: { key: reading.key, label: reading.label, members: [] },
			};
			found.set(reading.key, held);
		}
		held.group.members.push({ record, at });
	});
	const collator = new Intl.Collator(options.locale, { numeric: true });
	const ordered = [...found.values()]
		.sort((left, right) => {
			if (options.alphabetical === true) {
				// The match key, with itself as the tiebreak: two keys a collator
				// calls equal must not swap places between renders.
				const by = collator.compare(left.group.key, right.group.key);
				if (by !== 0) return by;
				return left.group.key < right.group.key
					? -1
					: left.group.key > right.group.key
						? 1
						: 0;
			}
			return left.order < right.order ? -1 : left.order > right.order ? 1 : 0;
		})
		.map((held) => held.group);
	if (other.members.length > 0) ordered.push(other);
	return ordered;
}
