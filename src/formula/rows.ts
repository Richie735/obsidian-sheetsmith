/*
 * The sheet-wide row table (SPEC §5).
 *
 * The sibling of sheet.ts. That file answers "what is this name worth?"; this
 * one answers "which rows does this component hold?", which is what an
 * aggregate — `sum(inventory, Qty * Weight)` — walks.
 *
 * It knows nothing about rows beyond their names: a component hands over a
 * thunk, and this holds the three things a caller must not have to hold for
 * itself.
 *
 * - **Which ids exist.** A name that reaches no component at all is a different
 *   mistake from one reaching a component that holds no rows, and only
 *   something with the whole sheet in view can tell them apart.
 * - **Memoisation.** A row's computed columns are evaluated as the set is
 *   built, so two aggregates over one table must not build it twice.
 * - **The guard against walking a set that is already being walked.** A
 *   computed column that aggregates over its own table recurses through no
 *   published name, so sheet.ts's guard never sees it: without this one it does
 *   not terminate. It is the same shape as `Runtime.active` for functions and
 *   `active` in `buildSheetScope`, and it is not optional.
 *
 * The re-entry guard has one part the other two do not: **every walk in the cycle
 * fails as a whole.** Refusing the inner attempt alone would leave the outer one
 * succeeding — the column that sums the table would be absent from the row it is
 * computed for, the sum of the other columns would come out fine, and the cell
 * would show a number. Then one formula reads the table and gets an answer while
 * another reads the same table from inside it and does not, which is precisely
 * the disagreement about what a row says that SPEC §4.2 keeps a single row scope
 * to prevent. So the refusal propagates out of every walk in flight, and their
 * cells show "?" and say why.
 *
 * **And no further than that.** The refusal lasts the walk, not the sheet. A
 * component held past the walk that found the cycle is a component condemned for
 * something that may not be a cycle at all — SPEC §5's coarse edge, where a
 * published name aggregates over a table whose column reads that name back, is
 * one the name table's own guard unwinds — and holding it makes the outcome turn
 * on which formula the sheet happened to evaluate first.
 *
 * Failure is a value here, never a throw (PATTERNS §4): the evaluator asks,
 * gets a reason it can put in front of a reader, and throws that itself.
 */

import { RowValues } from '../types';

/** One component's rows, or why there are none to walk. */
export type RowSetResult = { rows: readonly RowValues[] } | { error: string };

/**
 * Ask what rows a component holds.
 *
 * `caller` is the builtin asking — `sum`, `count` — because one of the answers
 * names it: a reader told a component holds no rows needs to know what wanted
 * them. The other two answers are about the sheet rather than about the call,
 * and read the same whichever aggregate asked.
 */
export type RowLookup = (id: string, caller: string) => RowSetResult;

/** A component as the row table sees it: an id, and rows or nothing. */
export interface RowComponent {
	/** The component's layout id: the name an aggregate writes. */
	id: string;
	/**
	 * Builds this component's rows. Called at most once per sheet, since the
	 * table memoises what it returns.
	 *
	 * Absent where the component holds no rows an aggregate could walk, which
	 * is every component but one — and the distinction is the whole reason
	 * components with no rows are still listed here rather than left out.
	 */
	rows?: () => readonly RowValues[];
}

/**
 * Build the row lookup every aggregate on the sheet shares.
 *
 * Takes every component, not only the ones holding rows, so that
 * `sum(armour_class, x)` can say what is actually wrong with it.
 */
export function buildRowTable(
	components: readonly RowComponent[],
): RowLookup {
	const sources = new Map(components.map((one) => [one.id, one.rows]));
	const memo = new Map<string, readonly RowValues[]>();
	const active = new Set<string>();
	/**
	 * Ids caught in a cycle, for as long as a walk is in flight. Cleared when
	 * the outermost one unwinds: the refusal belongs to the walk that found the
	 * cycle and not to the component, so nothing is held against a component
	 * once there is no walk left to refuse.
	 */
	const refused = new Set<string>();

	/**
	 * The refusal, and it is one sentence for three shapes: a table whose own
	 * row formula aggregates over it, two tables whose formulas each aggregate
	 * over the other, and any longer ring of them.
	 *
	 * It used to end "so a column on it cannot sum it", which is true of the
	 * first shape only — the one it was written against. On a ring of two it is
	 * false of both ends, and it sent the reader hunting for a self-sum that was
	 * never there. "Reaches back to it, directly or through another table" is
	 * what all three have in common, and "a formula on its rows" rather than "a
	 * column" because a row's own named expression can close the ring as readily
	 * as a computed column can.
	 */
	const beingRead = (id: string): RowSetResult => ({
		error: `"${id}" is already being read, so an aggregate over it cannot resolve. A formula on its rows reaches back to it, directly or through another table — break that loop.`,
	});

	return (id, caller) => {
		const done = memo.get(id);
		if (done !== undefined) return { rows: done };
		if (refused.has(id)) return beingRead(id);
		if (!sources.has(id)) {
			// The second sentence names the likeliest cause, which the first
			// cannot: a formula names a component by its layout id, and the id is
			// not the heading the card shows. An author reading a sheet has the
			// heading in front of them and writes that, so "there is no table
			// called Inventory" is a true sentence about a table they are looking
			// at. Its two neighbours name an action and this one used to stop at
			// the diagnosis.
			return {
				error: `There is no table called "${id}" on this sheet. An aggregate names a component by its layout id, which is not the heading shown on its card.`,
			};
		}
		const build = sources.get(id);
		if (build === undefined) {
			// Three situations arrive here and this cannot tell them apart, which
			// is why one sentence has to cover all three: the component is not a
			// list of rows at all, or it is one whose configuration is refused, or
			// its section would not read. "Holds no rows" is only literally true
			// of the first — for the other two the table is refusing to answer
			// until an error the card is already showing is fixed, and an author
			// told their inventory is empty would go looking in the wrong place.
			// So the second clause names the action for those two, and the first
			// names it for the one where the aggregate is simply pointed at the
			// wrong component.
			return {
				error: `"${id}" holds no rows for ${caller}() to read. Only a table does, and a table showing an error of its own holds none until that is fixed.`,
			};
		}
		if (active.has(id)) {
			// A column reached from this walk summing the table the walk is of.
			// Reporting it beats recursing until the stack goes and takes the app
			// with it, and every component outside the cycle keeps working.
			//
			// **Every walk in the cycle is refused, and nothing outside it.**
			//
			// Marking the re-entered id alone leaves the other end of a ring
			// memoised as a complete row set with the column that reached across
			// silently absent — one formula reading that table getting an answer
			// where another does not, which is the disagreement this refusal
			// exists to prevent — and which end survived would depend on which
			// was asked for first, so grid order would decide which card broke.
			//
			// Marking every walk in flight is one table too many the other way. A
			// walk that merely *reached* the cycle is not in it: with A's column
			// summing B and B's column summing B, the ring is B alone, and A was
			// told a column on it sums it when it has no such column. `active` is
			// insertion-ordered and unwinds last-in-first-out, so it is the walk
			// chain root-first and the suffix from the re-entered id is exactly
			// the ring. A is left to fail on its own terms: the column waiting on
			// B resolves to nothing, so it is absent from A's rows and `?` in
			// A's cell — which agree — while every aggregate over A's stored
			// columns keeps working.
			const chain = [...active];
			for (const walking of chain.slice(chain.indexOf(id))) {
				refused.add(walking);
			}
			return beingRead(id);
		}
		active.add(id);
		try {
			const rows = build();
			// Asked after the build, because that is when the answer arrives:
			// the column that sums its own table was refused several frames
			// down and its absence from the row would otherwise be invisible
			// here. Not memoised either, so nothing holds the half-built set.
			if (refused.has(id)) return beingRead(id);
			memo.set(id, rows);
			return { rows };
		} finally {
			active.delete(id);
			// **The refusal is the walk's, not the component's.** Held past the
			// walk it would condemn a component that is in no cycle at all: a
			// published name reading an aggregate, and a column on that table
			// reading the name back, is a cycle to a component-level reading and
			// not one in fact (SPEC §5) — the name table's own guard unwinds it,
			// leaving the column unresolved and everything else live. Held, the
			// row table's guard fires first if a formula happens to reach the
			// column before the name, and then the name never resolves and every
			// unrelated aggregate over that table is refused for good. Which of
			// those two happens is evaluation order, so it would be grid order
			// deciding whether the sheet worked.
			if (active.size === 0) refused.clear();
		}
	};
}

/**
 * A table for the paths with no sheet around them: a component rendered on its
 * own, a formula evaluated in a test. Every lookup misses, which is the truth
 * there — nothing is on the sheet, because there is no sheet.
 */
export const NO_ROWS: RowLookup = buildRowTable([]);
