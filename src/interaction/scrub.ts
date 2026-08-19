/*
 * Drag a number sideways to change it, with a flick that coasts to a stop.
 *
 * The whole gesture: 1:1 tracking from the grab point, stiffening past either
 * end of the range, velocity sampled over a window, the throw projected on
 * release and then spent over several frames rather than landing at once, and
 * a press catching a throw in flight.
 *
 * Everything the range means is the caller's, read through callbacks rather
 * than captured: the upper end and the current value are asked for on every
 * frame, because a bound the caller owns can change under the gesture. The
 * class marking a scrub in progress is passed in for the same reason the
 * hold-repeat button's is.
 *
 * The constants below are tuned decisions rather than defaults, and each
 * records the case it was tuned against. Read those cases as cases: they name
 * the range size and unit spacing a number was measured at, never the kind of
 * control the gesture belongs to. A second consumer has to be able to tell
 * which numbers are general to the gesture and which would have to be
 * re-derived for a different range, and it cannot tell that from a comment
 * that names one caller — which is how this file read when it was first
 * extracted.
 */

/** How far the pointer travels per unit while scrubbing the value. */
const SCRUB_PX_PER_UNIT = 6;
/** Movement before a press on the number becomes a scrub rather than a caret. */
const SCRUB_THRESHOLD = 10;
/** Velocity samples older than this say nothing about where the finger is going. */
const VELOCITY_WINDOW = 100;

/**
 * Where a flick would come to rest: the exponential-decay form scroll
 * deceleration uses, not the textbook v²/2a.
 *
 * Deliberately not the 0.998 that suits scrolling. That constant is
 * calibrated in pixels of content, where a 1000px/s flick throwing 499px is
 * exactly right. Measured here against a 54-unit range at 6px per unit — the
 * case it was tuned on — 0.998 throws by 83, and a gentle release with a
 * little residual motion still moves 25. A small range read precisely is not a
 * long list skimmed, so this decelerates roughly five times harder.
 */
function project(velocity: number, deceleration = 0.99): number {
	return ((velocity / 1000) * deceleration) / (1 - deceleration);
}

/** A throw may not move the value by more than this share of the range. */
const MAX_THROW_SHARE = 0.25;
/**
 * And where there is no upper end to take a share of, this many units. A range
 * open at the top had no cap at all, so a hard release moved it by sixty-odd —
 * the same unreviewable jump the share exists to prevent.
 */
const MAX_THROW_UNBOUNDED = 25;

/**
 * How much of the remaining throw is spent each frame as it decelerates.
 * Small enough to read as coasting, large enough to settle in a few hundred
 * milliseconds rather than crawling to a halt.
 */
const THROW_DECAY = 0.18;

/**
 * How much harder the pointer has to work past a boundary. Crossing an end of
 * the range is the most consequential thing this gesture does, and it used to
 * feel identical to any other ten units — resistance makes crossing a decision
 * rather than a slip.
 *
 * It does not clamp. Whether an end is a limit or merely a status is the
 * caller's rule to state, and at least one caller needs it to be a status
 * rather than a fence (SPEC §4.2), so the gesture must not decide.
 */
const SCRUB_RESISTANCE = 4;

/**
 * Drag the value sideways to change it.
 *
 * Buttons alone make every large change a counting exercise, which is what
 * this is for. The gesture tracks the pointer 1:1 from where it was grabbed;
 * past either end of the range it stiffens, so crossing is felt rather than
 * slipped through; and on release the flick's velocity is projected forward
 * and then *coasted* over several frames rather than applied at once.
 *
 * That last part is the seam between gesture and animation. Landing the whole
 * projection in one frame is a teleport: the motion stops being continuous at
 * exactly the moment it should feel most so, and there is nothing left to
 * interrupt. Coasting also gives the gesture the undo it badly needs — a
 * press anywhere on the control catches the throw where it has reached.
 *
 * A press below the threshold is left alone, so tapping the number still puts
 * a caret in it and typing an exact value is unaffected.
 */
export function bindScrub(
	control: HTMLElement,
	input: HTMLInputElement,
	/** Apply the drag's net movement, measured from where the drag began. */
	applyNet: (net: number) => void,
	commit: () => void,
	/**
	 * Read rather than captured, not fixed at bind time: where the caller owns
	 * the upper end, the bound this gesture resists at is whatever the control
	 * shows now.
	 */
	ceilingOf: () => number | null,
	valueOf: () => number | null,
	/** Class marking a scrub in progress, for the caller's own stylesheet. */
	scrubbingClass: string,
): { cancel: () => void } {
	const view = control.ownerDocument.defaultView;
	let pointer: number | null = null;
	let startX = 0;
	let startValue = 0;
	/** The drag's own net, which the coast then carries further. */
	let dragNet = 0;
	let scrubbing = false;
	let history: { x: number; t: number }[] = [];
	let frame: number | undefined;

	/**
	 * Units bought by a pointer travelling `dx`, stiffening outside the range
	 * the caller declares. Computed from the grab point every frame rather than
	 * accumulated, so the value stays glued to the finger.
	 */
	const unitsFor = (dx: number): number => {
		const direction = Math.sign(dx);
		if (direction === 0) return 0;
		const ceiling = ceilingOf();
		const px = Math.abs(dx);
		// Room before the value leaves the range the caller declares.
		const free =
			direction < 0
				? Math.max(0, startValue)
				: ceiling === null
					? Infinity
					: Math.max(0, ceiling - startValue);
		const freePx = free * SCRUB_PX_PER_UNIT;
		if (px <= freePx) return direction * (px / SCRUB_PX_PER_UNIT);
		const beyond = (px - freePx) / (SCRUB_PX_PER_UNIT * SCRUB_RESISTANCE);
		return direction * (free + beyond);
	};

	const settle = (): void => {
		frame = undefined;
		control.classList.remove(scrubbingClass);
		commit();
	};

	/** Catch a throw in flight, keeping whatever it has reached. */
	const cancel = (): void => {
		if (frame === undefined) return;
		view?.cancelAnimationFrame(frame);
		settle();
	};

	/**
	 * Coast the projected distance out over successive frames. The scrubbing
	 * class stays on until it settles, so the fill bar tracks the number
	 * instead of easing to a value the number reached instantly.
	 */
	const coast = (total: number): void => {
		const from = dragNet;
		// A coast is decorative motion in the sense that matters here: the
		// value it arrives at is the same either way, so someone who has asked
		// for less movement gets the destination without the journey.
		if (view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true) {
			applyNet(from + total);
			settle();
			return;
		}
		let landed = 0;
		const tick = (): void => {
			const remaining = total - landed;
			if (Math.abs(remaining) < 1) {
				settle();
				return;
			}
			const step =
				Math.sign(remaining) *
				Math.max(1, Math.round(Math.abs(remaining) * THROW_DECAY));
			landed += step;
			// Still measured from where the drag began, so catching the throw
			// leaves the caller's own bookkeeping consistent with the value.
			applyNet(from + landed);
			frame = view?.requestAnimationFrame(tick);
		};
		frame = view?.requestAnimationFrame(tick);
	};

	input.addEventListener('pointerdown', (event) => {
		if (event.button !== 0) return;
		// Grabbing the number is also how you stop a throw you have started.
		cancel();
		pointer = event.pointerId;
		startX = event.clientX;
		startValue = valueOf() ?? 0;
		dragNet = 0;
		scrubbing = false;
		history = [{ x: event.clientX, t: event.timeStamp }];
	});

	input.addEventListener('pointermove', (event) => {
		if (pointer !== event.pointerId) return;
		const dx = event.clientX - startX;
		if (!scrubbing) {
			// Hysteresis: a press is a caret until it has clearly become a drag.
			if (Math.abs(dx) < SCRUB_THRESHOLD) return;
			scrubbing = true;
			input.setPointerCapture(event.pointerId);
			control.classList.add(scrubbingClass);
			// A native selection drag has already started inside the field by
			// now; user-select alone does not unpaint it.
			control.ownerDocument.getSelection?.()?.removeAllRanges();
		}
		event.preventDefault();
		history.push({ x: event.clientX, t: event.timeStamp });
		if (history.length > 8) history.shift();
		const wanted = Math.round(unitsFor(dx));
		if (wanted !== dragNet) {
			const before = valueOf();
			// The net, not the difference: recomputed from the grab point every
			// frame, so reversing a drag retraces its own path exactly.
			applyNet(wanted);
			dragNet = wanted;
			const after = valueOf();
			// One tick as the value crosses zero. The single moment in this
			// gesture worth a haptic: causally obvious, and not decoration.
			if (before !== null && after !== null && before > 0 && after <= 0) {
				view?.navigator.vibrate?.(10);
			}
		}
	});

	const release = (event: PointerEvent): void => {
		if (pointer !== event.pointerId) return;
		pointer = null;
		if (!scrubbing) return;
		scrubbing = false;

		// Velocity over the last few samples only: what the finger was doing
		// on the way out, not its average across the whole gesture.
		const last = history.at(-1);
		const first = history.find((point) => last && last.t - point.t <= VELOCITY_WINDOW);
		let thrown = 0;
		if (last && first && last.t > first.t) {
			const pxPerSecond = ((last.x - first.x) / (last.t - first.t)) * 1000;
			thrown = Math.round(project(pxPerSecond) / SCRUB_PX_PER_UNIT);
			// However hard it was thrown, a flick may not cross the whole range.
			// The gesture is worth having because it covers ground quickly, not
			// because it can traverse everything in one movement.
			const ceiling = ceilingOf();
			const cap =
				ceiling !== null
					? Math.max(1, Math.round(ceiling * MAX_THROW_SHARE))
					: MAX_THROW_UNBOUNDED;
			thrown = Math.max(-cap, Math.min(cap, thrown));
		}
		if (thrown === 0) {
			control.classList.remove(scrubbingClass);
			commit();
			return;
		}
		coast(thrown);
	};

	input.addEventListener('pointerup', release);
	input.addEventListener('pointercancel', release);

	return { cancel };
}
