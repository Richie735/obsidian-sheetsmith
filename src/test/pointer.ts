/*
 * The pointer gestures a test presses a control with.
 *
 * Extracted because `press` had been redeclared three times inside
 * `pool.test.ts` and once more in `table.test.ts`, over some thirty dispatch
 * sites, which is past PATTERNS §1's extract-at-three by any reading. The event
 * shape is the thing shared: `pointerId` is what `scrub.ts` and `track.ts`
 * match a move against its own down, and `button: 0` is what `pool.ts` and
 * `scrub.ts` check before treating a press as one.
 *
 * `src/test/` rather than beside a component, because §2 names this folder for
 * scaffolding and no component owns a gesture every component is driven by.
 *
 * Not here, and both exclusions are the same rule — a gesture belongs to this
 * module only where the event shape is the whole of what is shared:
 *
 * - **The drag sequences.** A scrub is a down, a run of moves at rising
 *   `clientX`, and an up at the last of them — spelled once per test that needs
 *   it, because each one chooses its own coordinates.
 * - **The keyboard presses.** `card.test.ts` and `track.test.ts` each keep a
 *   `pressKey`, and they stay there because a key has no pointer to carry: there
 *   is no `pointerId` to keep in step and no `button` to get wrong, so the event
 *   is a one-liner and the two are not even the same one-liner — Card's takes
 *   the input, Track's takes the card and resolves the run inside it, and only
 *   Track's sets `cancelable`. Two consumers of a shape neither shares is where
 *   §1 keeps a copy. Named `pressKey` rather than `press` so that `press` means
 *   one gesture across the repository: the retired backlog row counted Card's
 *   keyboard helper as a fifth copy of the pointer press, which is the mistake
 *   the shared name invites.
 */

import { vi } from 'vitest';

/**
 * The element a gesture lands on.
 *
 * Nullable for one reason: `noUncheckedIndexedAccess` types `steps[0]` off a
 * `NodeListOf` as `HTMLButtonElement | undefined`, and threading a guard through
 * thirty call sites to say so buys nothing.
 *
 * **It is not a licence for a query that missed, and the caller owes the
 * assertion this cannot make.** These helpers no-op on nothing, where
 * `table.test.ts`'s own `press` took a non-optional `HTMLElement` and threw. So
 * a gesture test whose selector stops matching now presses nothing and reports
 * nothing, unless something after the gesture dereferences the element without
 * `?.` — a later `.click()`, a `.getAttribute()`, or an explicit throw. That
 * deref is what keeps the test from passing vacuously (§10), and it is the
 * caller's to write.
 */
type Target = Element | null | undefined;

/**
 * Put the pointer down and leave it there.
 *
 * The half a hold is made of, and on its own the whole of a press that must not
 * end: a `pointerup` cancels the long-press timer, so a test waiting for one
 * presses without releasing.
 */
export function pressDown(el: Target, init: PointerEventInit = {}): void {
	el?.dispatchEvent(
		new PointerEvent('pointerdown', { pointerId: 1, button: 0, ...init }),
	);
}

/** Lift the pointer, ending whatever gesture was under it. */
export function release(el: Target): void {
	el?.dispatchEvent(
		new PointerEvent('pointerup', { pointerId: 1, button: 0 }),
	);
}

/**
 * A full pointer press: down, then up.
 *
 * A stepper lands its step on the way down — feedback belongs on the press —
 * and its commit on the way up, so a hold writes the note once rather than once
 * per repeat. Both halves carry `init`, because a modifier held through a press
 * is held through both.
 */
export function press(el: Target, init: PointerEventInit = {}): void {
	pressDown(el, init);
	el?.dispatchEvent(
		new PointerEvent('pointerup', { pointerId: 1, button: 0, ...init }),
	);
}

/**
 * Press and keep holding for `ms` of fake time. Requires fake timers.
 *
 * The gesture repeat and the long press are both timing the control owns, and
 * §10 puts that beside the control's other gesture tests rather than in a file
 * of its own. Releasing is the caller's, because what the release proves — that
 * the run commits once, that a bubble was already open — is the assertion.
 */
export function hold(el: Target, ms: number, init: PointerEventInit = {}): void {
	pressDown(el, init);
	vi.advanceTimersByTime(ms);
}
