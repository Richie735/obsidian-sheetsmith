/*
 * The second door onto what a hover shows.
 *
 * A `title` is the right carrier on a desktop — it costs no layout, no tab
 * stop, and no attention until asked for. It is also the whole story only
 * where there is a pointer: it has no long-press behaviour, and on a touch
 * device it never appears at all. So a mark standing in for a word leaves no
 * route to the word, and a value computed from an expression leaves no route
 * to the expression, or to the name the expression could not find. Both were
 * observed on touch before this existed — on a level ring and on a computed
 * table cell — but the shape is the general one, and this module is not
 * entitled to know what either of those is.
 *
 * This is that route: anchored to whatever element it explains, one at a time,
 * and dismissed by the next thing the user does.
 */

/** How long a press has to be held before it is a request, not a tap. */
export const LONG_PRESS = 450;

/** Gap between the anchor and the bubble, in pixels. */
const OFFSET = 8;

let openEl: HTMLElement | null = null;
let teardown: (() => void) | null = null;
let counter = 0;

/** Close whatever is open, and unhook everything it registered. */
export function closePopover(): void {
	teardown?.();
	teardown = null;
	openEl?.remove();
	openEl = null;
}

/**
 * Show `text` anchored to `anchor`. Placed above where there is room and
 * below where there is not, and clamped into the viewport horizontally so a
 * cell at the edge of a scrolled table still reads.
 *
 * Attached to the document rather than the cell: the table scrolls inside an
 * overflow box, and a bubble inside that box would be clipped by it.
 */
export function showPopover(anchor: HTMLElement, text: string): void {
	const doc = anchor.ownerDocument;
	const view = doc.defaultView;
	closePopover();

	const el = doc.createElement('div');
	el.className = 'sheetsmith-popover';
	el.id = `sheetsmith-popover-${++counter}`;
	el.setAttribute('role', 'tooltip');
	el.textContent = text;
	doc.body.appendChild(el);

	// Named by what it explains, for as long as it is explaining it.
	anchor.setAttribute('aria-describedby', el.id);

	const box = anchor.getBoundingClientRect();
	const size = el.getBoundingClientRect();
	const width = view?.innerWidth ?? size.width;
	const above = box.top - size.height - OFFSET;
	el.style.top = `${above >= 0 ? above : box.bottom + OFFSET}px`;
	el.style.left = `${Math.max(
		OFFSET,
		Math.min(
			width - size.width - OFFSET,
			box.left + box.width / 2 - size.width / 2,
		),
	)}px`;

	const dismiss = () => closePopover();
	const onKey = (event: KeyboardEvent) => {
		if (event.key === 'Escape') dismiss();
	};
	// The next press anywhere, a scroll, or Escape. Capture, so a press that
	// something else swallows still counts as "the user moved on".
	doc.addEventListener('pointerdown', dismiss, true);
	doc.addEventListener('keydown', onKey, true);
	view?.addEventListener('scroll', dismiss, true);

	teardown = () => {
		doc.removeEventListener('pointerdown', dismiss, true);
		doc.removeEventListener('keydown', onKey, true);
		view?.removeEventListener('scroll', dismiss, true);
		anchor.removeAttribute('aria-describedby');
	};
	openEl = el;
}

/**
 * Reveal `text()` on a long press, and tell the caller to swallow the click
 * that follows. The press is a second gesture on a control that already has
 * one, so the tap it grew out of must not also fire.
 *
 * Touch only. A mouse already has the hover that `title` answers, so the
 * press would buy nothing and cost the thing it disambiguates against: a
 * click held past LONG_PRESS would open a bubble and then be swallowed,
 * which is a deliberate click that does nothing. Holding a click that long
 * is ordinary for a hand with a tremor, so the cost lands hardest on the
 * people least able to avoid it. A disambiguation delay is only worth paying
 * where the gesture it disambiguates actually exists.
 *
 * Returns a function reporting whether the click now arriving belongs to a
 * long press that already did its job.
 */
export function bindLongPress(
	el: HTMLElement,
	text: () => string | null,
): () => boolean {
	const view = el.ownerDocument.defaultView;
	let timer: number | undefined;
	let fired = false;

	const cancel = () => {
		if (timer !== undefined) view?.clearTimeout(timer);
		timer = undefined;
	};

	el.addEventListener('pointerdown', (event) => {
		fired = false;
		cancel();
		if (event.pointerType === 'mouse') return;
		timer = view?.setTimeout(() => {
			const message = text();
			if (message === null) return;
			fired = true;
			showPopover(el, message);
		}, LONG_PRESS);
	});
	for (const event of ['pointerup', 'pointerleave', 'pointercancel']) {
		el.addEventListener(event, cancel);
	}

	return () => {
		if (!fired) return false;
		fired = false;
		return true;
	};
}
