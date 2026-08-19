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
