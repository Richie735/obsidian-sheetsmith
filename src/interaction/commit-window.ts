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
 * Three taps on minus and a correcting plus is one gesture and one write, not
 * four — and because the gesture is measured from where it began, the plus
 * refunds the buffer the minuses drained rather than paying the pool instead.
 * Every path that ends an interaction flushes it early, so the window is only
 * ever waiting to see whether another adjustment is coming.
 */
export const GESTURE_COMMIT = 700;
