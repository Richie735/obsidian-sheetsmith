/*
 * What a commit to a level field's names says to the conditions reading it and
 * the notes storing it (`docs/features/conditional-field-visibility.md`,
 * **Reorder**; `docs/features/level-list-reorder-report.md`).
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
 * **Every level list, and the notes as well as the conditions**
 * (`docs/features/level-list-reorder-report.md`). The same commit rereads every
 * stored level in every note on the layout, since a note holds the position
 * too, so the sentence also counts the character notes holding a section for
 * the component — a count of sections, never of fields, because opening a cell
 * to see whether it holds a level would teach the editor each component's
 * storage. **Reported, never migrated**: the conditions and the reset clauses
 * name a level by position as well and nothing can renumber an expression, so
 * rewriting the notes alone would leave them disagreeing with their own
 * conditions, which is worse than both agreeing on the new order. The notice
 * offers the undo instead, and the pane raises it.
 *
 * **A level renamed in place moves nothing and says nothing**, because the
 * position is the same and so is every condition's meaning. A move is a name
 * present in both lists at a different position; a shortening is a lower
 * highest level, since `levelOf` clamps a stored value past the end and so
 * rereads some notes too.
 *
 * Pure, and in `editor/` rather than beside the columns editor that commits the
 * list, on `docs/PATTERNS.md` §1's atomicity test: `list-fields.ts` draws
 * list fields, and what a reorder means is a rule rather than a drawing.
 */

import { levelCount, parseLevel } from '../components/level-ring';
import { series, spelled } from '../parse/spelled';

/** A level field's names, or its count where it has none, as the layout holds it. */
export interface LevelList {
	levels?: string[];
	max?: number;
}

/**
 * The reset bindings reading a key by position: their triggers, once each, and
 * which row of a binding reads it — **Only where**, **Resets to**, or both —
 * so the clause names the row the fix is under
 * (`docs/features/record-set-reset-field-targeting.md`, Part 6).
 */
export interface ResetReaders {
	triggers: string[];
	where: boolean;
	to: boolean;
}

const NO_RESETS: ResetReaders = { triggers: [], where: false, to: false };

/**
 * The character notes on this layout holding a non-empty section for the
 * component whose list this is: its label, which heads the section, and how
 * many notes the scan counted.
 */
export interface NotesHolding {
	label: string;
	notes: number;
}

/** Nothing counted, which says the same as no note holding a section. */
const NO_NOTES: NotesHolding = { label: '', notes: 0 };

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
 * `readers` are the keys of the fields whose conditions read `key`, and
 * `resets` the reset bindings that read it (`docs/features/record-set-reset-scope.md`);
 * `holding` the notes the pane counted, zero where it counted nothing — a write
 * that failed, a file that is not its name's layout, a component with no label.
 * All three empty says nothing, since nothing reads the list. **A reset's `to`
 * counts only where it is worked out on each entry**, which the caller decides:
 * a `to` resolved once in sheet scope reads no record's field, so a reorder
 * cannot change what it means.
 */
export function levelReorderNotice(
	key: string,
	before: LevelList,
	after: LevelList,
	readers: readonly string[],
	resets: ResetReaders = NO_RESETS,
	holding: NotesHolding = NO_NOTES,
): string | null {
	const { triggers } = resets;
	const { notes } = holding;
	if (readers.length === 0 && triggers.length === 0 && notes === 0) return null;

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

	const sentences = [`"${key}" levels ${parts.join('; and ')}.`];
	if (readers.length > 0) {
		const one = readers.length === 1;
		sentences.push(
			`The condition${one ? '' : 's'} on ${spelled(readers)} read${one ? 's' : ''} ${key} by position, so ${one ? 'it now means' : 'they now mean'} something else. Check ${one ? 'it' : 'them'} under Shown when.`,
		);
	}
	if (triggers.length > 0) {
		/*
		 * A reset's clause beside the fields' clause, rather than one sentence
		 * for both: the two conditions are fixed in two places, so each clause
		 * names the control its fix is under. Trigger names are the layout's own
		 * words, so they go unquoted, the way the rest of the pane writes them.
		 */
		const one = triggers.length === 1;
		// `it` where the field clause has already named the key.
		const what = readers.length > 0 ? 'it' : key;
		const rows = [
			...(resets.where ? ['Only where'] : []),
			...(resets.to ? ['Resets to'] : []),
		].join(' and ');
		sentences.push(
			`The ${series(triggers)} reset${one ? '' : 's'} read${one ? 's' : ''} ${what} by position${readers.length > 0 ? ' too' : ''}, so what ${one ? 'it resets has' : 'they reset has'} changed. Check ${one ? 'it' : 'them'} under ${rows}.`,
		);
	}
	if (notes > 0) {
		/*
		 * Last, after the clauses naming a fix the author can make under Shown
		 * when or Only where: this one has no fix but the undo. "Is now read
		 * against the new list" rather than "has moved", because it is true of a
		 * move and a shortening alike, and of a level that did not move — so it
		 * claims nothing the count of sections cannot back. The label is the
		 * layout's own word, unquoted as trigger names are.
		 */
		const one = notes === 1;
		sentences.push(
			`${notes} ${one ? 'note' : 'notes'} on this layout ${one ? 'holds' : 'hold'} a section for ${holding.label}, and any ${key} level ${one ? 'it stores' : 'they store'} is now read against the new list.`,
		);
	}
	return sentences.join(' ');
}

