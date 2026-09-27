/*
 * What a commit to a level field's names says to the conditions reading it
 * (`docs/features/conditional-field-visibility.md`, **Reorder**).
 *
 * A level stores its *position*, and the expression language has no strings,
 * so a condition names a level by number: `Recharges == 1 || Recharges == 2`.
 * Reordering the names, inserting one before another, or shortening the list
 * therefore changes what every such condition means — silently, and nothing
 * can tell from the condition alone. This is the report at the one moment it
 * can be told: the commit that moved them. Nothing rewrites the condition, and
 * the position legend under **Shown when** is the standing half once the notice
 * is gone.
 *
 * **Only a list a condition reads.** A reorder of a level list no condition
 * reads rereads every note's stored positions too, but that hazard is older
 * than conditions and `docs/BACKLOG.md` holds it; widening this to it is a
 * decision about data safety rather than about conditions.
 *
 * **A level renamed in place moves nothing and says nothing**, because the
 * position is the same and so is every condition's meaning. A move is a name
 * present in both lists at a different position; a shortening is a lower
 * highest level, since `levelOf` clamps a stored value past the end and so
 * rereads some notes too.
 *
 * Pure, and in `editor/` rather than beside the columns editor that raises the
 * notice, on `docs/PATTERNS.md` §1's atomicity test: `list-fields.ts` draws
 * list fields, and what a reorder means is a rule rather than a drawing.
 */

import { levelCount, parseLevel } from '../components/level-ring';
import { spelled } from '../parse/spelled';

/** A level field's names, or its count where it has none, as the layout holds it. */
export interface LevelList {
	levels?: string[];
	max?: number;
}

/**
 * How many moved levels the sentence names before it counts the rest.
 *
 * **Not `parse/spelled.ts`'s bound**, which counts *names*: each move here is a
 * whole clause — `"Long rest" was 2 and is now 1` — so five of them is a
 * paragraph where five names is one line.
 */
const NAMED_MOVES = 3;

/**
 * The sentence a commit from `before` to `after` owes the conditions naming
 * `key`, or null where no condition's meaning changed.
 *
 * `readers` are the keys of the fields whose conditions read `key`; an empty
 * list is a list no condition reads, which says nothing.
 */
export function levelReorderNotice(
	key: string,
	before: LevelList,
	after: LevelList,
	readers: readonly string[],
): string | null {
	if (readers.length === 0) return null;

	const names = (list: LevelList): string[] =>
		(list.levels ?? []).map((entry) => parseLevel(entry).name);
	const was = names(before);
	const now = names(after);
	const moved: string[] = [];
	was.forEach((name, from) => {
		// The first occurrence, so a name repeated in one list is not read as
		// having moved to its own twin.
		if (was.indexOf(name) !== from) return;
		const to = now.indexOf(name);
		if (to === -1 || to === from) return;
		moved.push(`"${name}" was ${from} and is now ${to}`);
	});

	const highestWas = levelCount(before);
	const highestNow = levelCount(after);
	const shortened = highestNow < highestWas;

	if (moved.length === 0 && !shortened) return null;

	const parts: string[] = [];
	if (moved.length > 0) {
		const shown = moved.slice(0, NAMED_MOVES);
		const rest = moved.length - shown.length;
		// A semicolon between two moves, since each already says "and".
		parts.push(
			`moved: ${shown.join('; ')}${rest > 0 ? `; and ${rest} more` : ''}`,
		);
	}
	if (shortened) {
		parts.push(
			`shortened: the highest is now ${highestNow}, where it was ${highestWas}`,
		);
	}

	const one = readers.length === 1;
	const whose = spelled(readers);
	return `"${key}" levels ${parts.join('; and ')}. The condition${one ? '' : 's'} on ${whose} read${one ? 's' : ''} ${key} by position, so ${one ? 'it now means' : 'they now mean'} something else. Check ${one ? 'it' : 'them'} under Shown when.`;
}

