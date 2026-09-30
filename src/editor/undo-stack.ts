/*
 * The layout editor's undo/redo history.
 *
 * Whole-file text snapshots, not per-operation inverses — the same choice
 * `SheetView.offerUndo` already made (`src/view/sheet-view.ts`), and for the
 * same reason: a mutation can change several things in one write (a component
 * removal moves its children to the sheet's bottom), and a snapshot restores
 * the lot by construction rather than by getting every inverse right and in
 * order.
 *
 * Named for the behaviour rather than for the pane it serves
 * (`docs/PATTERNS.md` §2): push a snapshot, pop it, cap the depth. Nothing here
 * knows about a `Layout`, a DOM, or which pane is asking — that is
 * `LayoutEditorSection`'s job, which owns two of these (one undo, one redo)
 * and decides when a push happens and what a popped snapshot means. What a
 * snapshot is — a string, or the pane's text marked as never having been a file
 * (`docs/features/unsaveable-layout.md` §3) — is the owner's type to choose.
 */

/**
 * How many snapshots one stack holds before the oldest is dropped.
 *
 * A layout file is small text, so the cost is not memory; the cap exists so a
 * very long editing session does not grow the array without bound for no
 * benefit anyone would notice past the first few dozen steps.
 */
const MAX_DEPTH = 100;

export class UndoStack<T = string> {
	private entries: T[] = [];

	/** Push a snapshot. Drops the oldest once the depth cap is exceeded. */
	push(snapshot: T): void {
		this.entries.push(snapshot);
		if (this.entries.length > MAX_DEPTH) this.entries.shift();
	}

	/** Pop the most recent snapshot, or undefined where the stack is empty. */
	pop(): T | undefined {
		return this.entries.pop();
	}

	/** How many snapshots the stack currently holds. */
	get depth(): number {
		return this.entries.length;
	}

	/** Drop every snapshot, e.g. when the pane's open layout changes. */
	clear(): void {
		this.entries = [];
	}
}
