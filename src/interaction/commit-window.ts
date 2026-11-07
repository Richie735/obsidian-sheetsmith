/*
 * How long a run of adjustments stays open before it is written.
 *
 * Shared rather than duplicated. Pool and Track both buffer a run of changes
 * and both waited 700ms, in two constants that nothing kept in step — and the
 * number is not arbitrary to either of them: it is how long a player has to
 * make the next adjustment before the last one is treated as finished. Two
 * controls disagreeing about that would be two controls that feel different
 * for no reason.
 */

/**
 * How long a run of adjustments stays open before it is written.
 *
 * Three taps down and a correcting tap up is one gesture and one commit, not
 * four. And because the run is measured from where it began rather than
 * accumulated, the correction unwinds what the earlier taps did instead of
 * being applied on top of them — which is what lets a caller holding a buffer
 * refund it rather than double-count. Every path that ends an interaction
 * flushes early, so the window is only ever waiting to see whether another
 * adjustment is coming.
 */
export const GESTURE_COMMIT = 700;

/** A run of adjustments, held open and written once. */
export interface CommitWindow {
	/**
	 * Keep the run open: write when no adjustment has come for the window.
	 * A function property rather than a method, so a caller may hold it bare.
	 */
	soon: () => void;
	/** End the run now and write, which every path leaving the control takes. */
	now: () => void;
}

/**
 * The end-of-run write Pool, Track and Stat block's steppers share: a timer the
 * next adjustment resets, a flush that cancels it, and a guard that writes
 * nothing once a rebuild has replaced the control.
 *
 * **Extracted on the third consumer** (PATTERNS §1): three copies of a timer
 * and its flush are three places for the reschedule or the guard to go missing
 * in one of them. The guard is the caller's `anchor`, so each still names what
 * a rebuild replaces — a Pool's or a stepper's field, a Track's card — and
 * this module names neither.
 */
export function commitWindow(
	view: Window | null | undefined,
	/** The element a rebuild replaces; a commit after it has gone writes nothing. */
	anchor: Node,
	write: () => void,
): CommitWindow {
	let timer: number | undefined;
	const now = (): void => {
		if (timer !== undefined) {
			view?.clearTimeout(timer);
			timer = undefined;
		}
		// A rebuild replaces the control, and a commit arriving after that would
		// be writing values read out of a detached one.
		if (!anchor.isConnected) return;
		write();
	};
	return {
		now,
		soon: () => {
			if (timer !== undefined) view?.clearTimeout(timer);
			timer = view?.setTimeout(now, GESTURE_COMMIT);
		},
	};
}
