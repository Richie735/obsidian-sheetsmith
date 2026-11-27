/*
 * A headline number that does not fit its card is marked, never shown as part
 * of its digits (`docs/features/headline-narrow-cell.md`).
 *
 * The size is CSS: `--sheetsmith-headline-size` shrinks the number with a
 * narrow card down to a floor above every qualifier on it. Below the floor a
 * long value still does not fit, and this module is what says so. It compares
 * the number's own `scrollWidth` with its `clientWidth` and toggles
 * `.sheetsmith-headline-cut` on the number and on the box the mark is laid
 * over; the stylesheet turns the digits transparent and shows the mark, `⋯`.
 *
 * **Shared from the start, on three consumers** (`docs/PATTERNS.md` §1): a
 * card's derived number and a card's own field (`card-face.ts`, for Card and
 * Card set alike), and a Pool's field. It knows none of them: the classes are
 * its own and the host is handed in, `linked-text.ts`'s arrangement.
 *
 * **It reads and sets a state, never a size**, so it cannot loop: the cut class
 * changes no box, and the next measurement sees the same widths. That is the
 * whole of why a `ResizeObserver` may call it (`view/headline-fit.ts`).
 *
 * **The mark is attached only while the number is cut.** A derived is its own
 * host, so a mark inside it would be part of its `textContent`, which its
 * announcements and every reader of the derived's text read; attached only
 * while cut, an uncut number's DOM is exactly what it was. A derived's text is
 * replaced whole when it repaints, which drops the mark with it, so the caller
 * refits after setting a value and the mark comes back.
 */

/** On every number this module watches. */
export const HEADLINE_CLASS = 'sheetsmith-headline';
/** On a watched number, and its host, while the number does not fit. */
export const HEADLINE_CUT_CLASS = 'sheetsmith-headline-cut';
/** On the box the mark is laid over, which takes `position: relative`. */
export const HEADLINE_HOST_CLASS = 'sheetsmith-headline-host';
/** The mark standing in for a number that does not fit. */
export const HEADLINE_MARK_CLASS = 'sheetsmith-headline-mark';

/**
 * What the mark says: one character, so it fits where one digit nearly does.
 * The midline ellipsis, U+22EF, rather than `…`: the mark is laid over the
 * number's box, and `…` sits on the baseline, about a third of the box below
 * its middle, so on a coin at the card's foot it read as part of the edge and
 * on a modified tile it sat on the underline. `⋯` is centred on the line.
 */
const MARK = '⋯';

/** What a read-only number does while it holds the stop its cut state gave it. */
export interface HeadlineStop {
	/**
	 * Told when the number gains the stop and when it gives it up, so the caller
	 * can name and describe the button it has become (and stop doing so). Told
	 * `true` again on every refit while it holds the stop and is still cut,
	 * since the value it names may have been repainted since.
	 */
	onHold?(held: boolean): void;
}

interface Stamped {
	host: HTMLElement;
	mark: HTMLElement;
	/**
	 * Set where the number takes a tab stop while cut: a read-only number, which a
	 * keyboard reader cannot otherwise reach. A field is a tab stop already.
	 */
	stop: HeadlineStop | null;
	/** Whether the stop is held now, so a hold or a release is reported once. */
	held: boolean;
	/**
	 * Whether a blur is already awaited to release the stop. One listener per
	 * focus, however many refits a resize drag makes while it waits.
	 */
	releaseOnBlur: boolean;
}

/**
 * How far `scrollWidth` may pass `clientWidth` before a number counts as cut.
 * Chromium reports a centered input one pixel wider than its box for some
 * values, from the caret and the subpixel offset of the centering, with every
 * digit in view: a Pool's "3" in a 69px field read 70 against 69 and drew `⋯`.
 * A real overflow of one pixel clips nothing a reader would miss.
 */
const OVERFLOW_SLACK = 1;

/** Per number, so a refit finds its host and its mark again. */
const stamped = new WeakMap<HTMLElement, Stamped>();

/**
 * Watch `el` as a headline laid over `host`. The mark is built now and attached
 * only while `el` is cut.
 *
 * `stop` is for a read-only number: while cut it takes `tabindex="0"` and
 * `role="button"`, since a sighted reader without a pointer has no other way to
 * its value, and the caller answers Enter and Space on it and names it.
 */
export function stampHeadline(
	el: HTMLElement,
	host: HTMLElement,
	options: { stop?: HeadlineStop } = {},
): void {
	el.classList.add(HEADLINE_CLASS);
	host.classList.add(HEADLINE_HOST_CLASS);
	// The global `createSpan`, attached only while the number is cut.
	const mark = createSpan({ cls: HEADLINE_MARK_CLASS, text: MARK });
	mark.setAttribute('aria-hidden', 'true');
	stamped.set(el, { host, mark, stop: options.stop ?? null, held: false, releaseOnBlur: false });
}

/** Whether `el` is a stamped headline that is cut now. */
export function isHeadlineCut(el: HTMLElement): boolean {
	return el.classList.contains(HEADLINE_CUT_CLASS);
}

/**
 * Measure `el` and set its cut state, attaching or removing its mark.
 *
 * Called by the view's observer on a resize, and by a component after it sets
 * a value in code, since a value changing inside a capped box resizes nothing
 * an observer would see. Calling it again on unchanged metrics leaves the state
 * where it was. A number with nothing in it is never cut.
 */
export function refitHeadline(el: HTMLElement): void {
	const entry = stamped.get(el);
	if (entry === undefined) return;
	const cut = headlineValue(el) !== '' && el.scrollWidth - el.clientWidth > OVERFLOW_SLACK;
	el.classList.toggle(HEADLINE_CUT_CLASS, cut);
	entry.host.classList.toggle(HEADLINE_CUT_CLASS, cut);
	if (cut) {
		// Re-attached where a repaint dropped it with the text it sat beside.
		if (entry.mark.parentElement !== entry.host) entry.host.appendChild(entry.mark);
	} else {
		entry.mark.remove();
	}
	if (entry.stop !== null) settleStop(el, entry, cut);
}

/** Whether `el` holds the stop its cut state gave it, which a key may act on. */
export function holdsHeadlineStop(el: HTMLElement): boolean {
	return stamped.get(el)?.held === true;
}

/**
 * The read-only number's tab stop follows its cut state, except that **a
 * number holding focus keeps its stop until it is blurred**: a resize that
 * makes it fit must not pull focus out from under the reader.
 */
function settleStop(el: HTMLElement, entry: Stamped, cut: boolean): void {
	if (cut) {
		// Already held: the value may have been repainted since (a draft in the
		// pill, a commit), so the caller names the button again from it.
		if (entry.held) entry.stop?.onHold?.(true);
		else hold(el, entry, true);
		return;
	}
	if (!entry.held) return;
	if (el.ownerDocument.activeElement !== el) {
		hold(el, entry, false);
		return;
	}
	if (entry.releaseOnBlur) return;
	entry.releaseOnBlur = true;
	el.addEventListener(
		'blur',
		() => {
			entry.releaseOnBlur = false;
			if (!isHeadlineCut(el)) hold(el, entry, false);
		},
		{ once: true },
	);
}

/** Gain or give up the stop, reporting only a change. */
function hold(el: HTMLElement, entry: Stamped, held: boolean): void {
	if (entry.held === held) return;
	entry.held = held;
	if (held) {
		el.setAttribute('tabindex', '0');
		el.setAttribute('role', 'button');
	} else {
		el.removeAttribute('tabindex');
		el.removeAttribute('role');
	}
	entry.stop?.onHold?.(held);
}

/**
 * The value `el` holds, without its mark: a field's `value`, or a read-only
 * number's text. A derived holds its mark as a child while cut, so its
 * `textContent` then ends in `⋯`, which is not part of the value.
 */
export function headlineValue(el: HTMLElement): string {
	// `instanceOf`, not `instanceof`: a field in a pop-out window has that
	// window's constructor (`ui/truncation.ts`).
	if (el.instanceOf(HTMLInputElement)) return el.value;
	const mark = stamped.get(el)?.mark;
	return Array.from(el.childNodes)
		.filter((node) => node !== mark)
		.map((node) => node.textContent ?? '')
		.join('');
}
