/*
 * A button that repeats while it is held.
 *
 * Gesture, not component: what it steps, what the step is called and what the
 * button looks like are all the caller's. It owns the timing — when a hold
 * starts repeating, how the repeat accelerates, and the floor it accelerates
 * to — because those are the numbers that decide whether holding a button
 * feels like holding a button, and a second control choosing its own would
 * mean two controls that behave differently for no reason a user could name.
 *
 * The class name is passed in rather than chosen here. This module has no
 * business naming a pool, and the caller already owns the stylesheet rule.
 */

/** How far one press of a step button moves the pool. */
const STEP = 1;
const STEP_SHIFT = 10;

/** Before a held step button starts repeating, and the floor it accelerates to. */
const HOLD_DELAY = 400;
const HOLD_FLOOR = 40;
/**
 * A ten-step gets a slower floor than a one-step. The ramp accelerates how
 * often a step lands, and Shift multiplies how far each one goes — together
 * they reached 250 a second, which covers ground faster than any flick while
 * the throw beside it is bounded to a quarter of the pool. Either the bound
 * is a principle or it is not.
 */
const HOLD_FLOOR_SHIFT = 120;
/** Each repeat lands sooner than the last, so a long press covers real ground. */
const HOLD_RAMP = 0.8;

/**
 * A step button that repeats while held.
 *
 * The most-pressed control on a sheet, and a table deals damage in sevens
 * rather than ones — seven discrete presses for one hit is the largest single
 * miss in the component. It answers on pointer-down rather than on click,
 * because feedback that waits for release reads as lag.
 *
 * Every repeat moves the draft only; the note is written once on release.
 * That is SPEC §4.2's rule — feedback continuous, persistence discrete — and
 * it is also what stops a two-second hold writing the note twenty times and
 * rebuilding the sheet under the finger.
 */
export function stepButton(
	doc: Document,
	field: HTMLInputElement,
	name: string,
	direction: 1 | -1,
	/** Class for the button. This module does not name the caller's card. */
	className: string,
	stepDraft: (delta: number) => void,
	/**
	 * Keeps the run of adjustments open rather than closing it. Consecutive
	 * taps are one gesture, and one write; leaving the card flushes it.
	 */
	commitSoon: () => void,
): HTMLButtonElement {
	const button = doc.createElement('button');
	button.type = 'button';
	button.classList.add(className);
	button.textContent = direction === 1 ? '+' : '−';
	const verb = direction === 1 ? 'Increase' : 'Decrease';
	button.setAttribute('aria-label', `${verb} ${name}`);
	// Shift for ten was implemented and announced nowhere, which makes it an
	// affordance nobody can find. The tooltip is the cheapest place to say so.
	button.title = `${verb} ${name}. Hold to repeat, Shift for ten.`;

	const view = doc.defaultView;
	let timer: number | undefined;
	let delay = HOLD_DELAY;
	/** Removes the live Shift listeners for the hold in progress. */
	let untrackShift: (() => void) | null = null;

	const stop = (): void => {
		if (timer !== undefined) view?.clearTimeout(timer);
		timer = undefined;
		delay = HOLD_DELAY;
		untrackShift?.();
		untrackShift = null;
	};

	const begin = (event: PointerEvent): void => {
		// A second pointer arriving before the first lifts would overwrite the
		// timer and leave the old one repeating forever. Stylus plus finger is
		// enough to do it.
		stop();
		// Take focus deliberately rather than letting the press put it wherever
		// the browser would. It is the field the buttons adjust, so the arrow
		// keys carry on from here — and it gives the run a blur to flush on,
		// which is the only signal the card gets that the user has moved away.
		event.preventDefault();
		field.focus();
		button.setPointerCapture(event.pointerId);

		// Read per tick rather than once: a hold is a continuous gesture, so
		// pressing or releasing Shift part-way through has to change what the
		// rest of it does. Captured once, the key was inert after the press.
		let shift = event.shiftKey;
		const watch = (key: KeyboardEvent): void => {
			shift = key.shiftKey;
		};
		doc.addEventListener('keydown', watch);
		doc.addEventListener('keyup', watch);
		untrackShift = () => {
			doc.removeEventListener('keydown', watch);
			doc.removeEventListener('keyup', watch);
		};

		stepDraft(direction * (shift ? STEP_SHIFT : STEP));
		const tick = (): void => {
			stepDraft(direction * (shift ? STEP_SHIFT : STEP));
			delay = Math.max(shift ? HOLD_FLOOR_SHIFT : HOLD_FLOOR, delay * HOLD_RAMP);
			timer = view?.setTimeout(tick, delay);
		};
		timer = view?.setTimeout(tick, HOLD_DELAY);
	};

	const end = (): void => {
		// A pointerup with no press behind it — capture lost, or a release that
		// began outside — has nothing to commit.
		if (timer === undefined) return;
		stop();
		commitSoon();
	};

	button.addEventListener('pointerdown', begin);
	button.addEventListener('pointerup', end);
	button.addEventListener('pointercancel', () => {
		stop();
		commitSoon();
	});
	// A keyboard activation produces a click with no preceding pointerdown;
	// detail is 0 there and non-zero for a pointer, which is what tells the
	// two apart without double-stepping a mouse press.
	button.addEventListener('click', (event) => {
		if (event.detail !== 0) return;
		stepDraft(direction * (event.shiftKey ? STEP_SHIFT : STEP));
		commitSoon();
	});

	return button;
}
