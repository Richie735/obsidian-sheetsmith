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
 * **The rule is the shape, not the event name**, and `cancel` arrived on the
 * second consumer rather than the third for that reason: a `pointercancel`
 * carrying a `pointerId` and no coordinates is the same one-step tier §1 puts a
 * timing or a set on, so a guard test over two copies could only assert they
 * still agree — which is what one name says for free. It was found the way that
 * section's other gaps were: the guard beside this module enumerated
 * `pointerdown|pointerup` and so could not see a third bare type. It names all
 * three now.
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
 * - **The keyboard presses.** `card.test.ts`, `track.test.ts` and
 *   `layout-editor.test.ts` each keep a `pressKey`. **Three is where §1's ladder
 *   extracts, so this is a departure**, and it does not turn on the count —
 *   which is what the earlier wording here got wrong, arguing from "two
 *   consumers" and going stale the moment a third arrived.
 *
 *   What it turns on: **a key carries nothing a caller can silently get wrong.**
 *   `pointerId` is what a later move or up is matched against, and `button: 0` is
 *   what production checks before treating a press as one, so a test that spells
 *   either wrong drives nothing and passes anyway. That silent class is the whole
 *   of what this module prevents. A `keydown`'s one load-bearing field is `key`,
 *   and it is the argument — spell it wrong and the assertion behind it fails.
 *
 *   Nor are the three one shape. Each resolves its own target: Card's takes the
 *   input, Track's takes the card and finds the run inside it, the editor's
 *   addresses a block by focus token because the block it pressed is detached by
 *   the time the next key goes out. And they disagree about `cancelable` — the
 *   editor's sets it and asserts on `defaultPrevented`, Card's does not set it,
 *   Track's sets it and reads it nowhere. §1's test for merging is that the only
 *   thing a guard could check is that the copies still agree; a merge here would
 *   have to pick one of three answers to that field.
 *
 *   Named `pressKey` rather than `press` so that `press` means one gesture across
 *   the repository: the retired backlog row counted Card's keyboard helper as a
 *   fifth copy of the pointer press, which is the mistake the shared name
 *   invites.
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
 * Take the pointer away, the way a system gesture or a lost device does.
 *
 * Named for the event and not for what a control does about it, which is the
 * whole of why it can be shared. The two callers disagree about the policy:
 * `layout-editor.test.ts` drives a schematic that treats a cancel as an abandon
 * and puts the block back, and `pool.test.ts` drives a stepper whose own comment
 * says "cancelled, not abandoned" — the repeat stops and the value it reached is
 * still written. A name carrying either answer would be wrong at the other site.
 *
 * The `pointerId` is not read by either: `hold-repeat.ts` and the schematic both
 * treat a cancel as unconditional. It stays because it is what makes this a
 * *bare* pointer event to the guard beside this module, whose predicate is a
 * `pointerId` or a `button` with no coordinates. Drop it as dead weight and a
 * hand-written cancel stops being something that check can see, which is how the
 * two copies got here in the first place.
 */
export function cancel(el: Target): void {
	el?.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 }));
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
