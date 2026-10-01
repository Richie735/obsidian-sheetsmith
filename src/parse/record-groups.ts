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

/** Where a record sits among the groups: the key it shares and its place in the order. */
export interface GroupReading {
	/** The stored value as a string. Never empty, which is what `OTHER_KEY` is. */
	key: string;
	/** The place in the order, ascending. */
	order: number;
}

/** One record, with the position the file gives it. */
export interface GroupedRecord<T> {
	record: T;
	at: number;
}

export interface RecordGroup<T> {
	/** The collapse state's key: `OTHER_KEY` for the group of records with no value. */
	key: string;
	/** Records in the file's order. */
	members: GroupedRecord<T>[];
}

/**
 * The key of the group a record with no reading goes under, which no reading's
 * key can be, so its collapse state cannot collide with a real group's.
 */
export const OTHER_KEY = '';

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
): RecordGroup<T>[] {
	const found = new Map<string, { order: number; group: RecordGroup<T> }>();
	const other: RecordGroup<T> = { key: OTHER_KEY, members: [] };
	records.forEach((record, at) => {
		const reading = read(record, at);
		// An empty key is `OTHER_KEY`'s, so a reading that gave one is no reading:
		// it cannot start a group that collides with Other's collapse state.
		if (reading === null || reading.key === OTHER_KEY) {
			other.members.push({ record, at });
			return;
		}
		let held = found.get(reading.key);
		if (held === undefined) {
			held = {
				order: reading.order,
				group: { key: reading.key, members: [] },
			};
			found.set(reading.key, held);
		}
		held.group.members.push({ record, at });
	});
	const ordered = [...found.values()]
		.sort((left, right) =>
			left.order < right.order ? -1 : left.order > right.order ? 1 : 0,
		)
		.map((held) => held.group);
	if (other.members.length > 0) ordered.push(other);
	return ordered;
}
