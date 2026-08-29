/*
 * A panel anchored to the control that opened it, with controls inside it.
 *
 * **It is the shared popover's *kind* grown a body, not a fourth kind of panel.**
 * `docs/UI.md` §9's first line is that a fourth kind of panel beside a row of
 * cards reads as loose chrome floating on the page — and that sentence is about a
 * panel in the page's own flow. A transient surface anchored to its control, one at
 * a time, dismissed by the next thing the reader does, is `.sheetsmith-popover`'s
 * kind, which §9 already blesses. So this extends that regime rather than
 * inventing a second floating one, and it shares the placement arithmetic with
 * `showPopover` rather than copying it.
 *
 * **The three alternatives are all closed, which is what makes this the shape.**
 * Obsidian's `Menu` closes on selection and `MenuItem` takes a title, an icon and
 * a click, so it hosts no controls at all; a `Modal` needs an `App` and SPEC §4.2
 * records that `RenderContext` carries no route to one; and `showPopover` sets
 * `textContent`, so a bubble admits no per-line styling and no controls.
 *
 * **This module is not entitled to know what it holds**, which is
 * `ui/popover.ts`'s own rule and the reason both live here. It takes an anchor, a
 * label and a body element; every word inside it is the caller's.
 *
 * **What it owes that `Menu` gave free**, listed because each is a place a plugin
 * gets a floating surface subtly wrong: placement and clamping (bought back by
 * sharing the popover's), dismissal on a press outside and on Escape (the
 * popover's regime with one departure), keyboard navigation and focus management
 * (owed, below), and a phone regime (owed, and read rather than seen — nothing
 * below a 500px viewport has ever been photographed).
 *
 * Plain DOM, and it imports nothing from `obsidian`: that is what keeps the
 * component layer's one-name allowlist one name long, and it is what took the
 * `Menu` import out of `src/` entirely.
 */

import { placeAnchored } from './popover';

/** A panel that is open, and the three things its opener still needs from it. */
export interface AnchoredPanel<S = unknown> {
	/**
	 * Whatever the opener needs to survive its own DOM being rebuilt.
	 *
	 * **Opaque here on purpose**, which is this module's own rule: it knows nothing
	 * about what it holds. What it *does* know is that the surface a panel is drawn
	 * over gets rebuilt — the sheet re-renders on every committed edit — so the
	 * panel is the one thing on the page that outlives the rebuild and is therefore
	 * the only place a form's own posture can live. The alternative is a
	 * module-level map keyed by cell somewhere in `components/`, which is the same
	 * state one indirection further from the thing it belongs to.
	 */
	state: S;
	/** Fill this with the panel's contents. */
	body: HTMLElement;
	/**
	 * Re-measure and re-place, after the body's contents have changed.
	 *
	 * A panel that commits per field re-renders parts of itself in place, and a
	 * form that grows by a line while anchored above its control would otherwise
	 * drift off it.
	 */
	place(): void;
	/** Close it, and put focus back on the anchor. */
	close(): void;
}

let openPanel: HTMLElement | null = null;
let openKey: string | null = null;
let openState: unknown = null;
let openAnchor: HTMLElement | null = null;
let unhook: (() => void) | null = null;
let counter = 0;

/** Close whatever panel is open, and unhook everything it registered. */
export function closeAnchoredPanel(): void {
	unhook?.();
	unhook = null;
	openPanel?.remove();
	openPanel = null;
	openKey = null;
	openState = null;
	openAnchor = null;
}

/** What is open, by the key its opener gave it, or null where nothing is. */
export function openAnchoredPanelKey(): string | null {
	return openKey;
}

/**
 * Hand an open panel to a freshly drawn control with the same key.
 *
 * **This is what "the panel stays open across every commit" is made of**, and it
 * is the best thing this surface buys over the menu it replaced. The sheet
 * re-renders on every committed edit, so the glyph the panel was anchored to is
 * destroyed and replaced by an identical one; the panel itself is attached to
 * `document.body` and survives. Re-anchoring rebinds it to the new control — for
 * placement, for Escape's focus return and for deciding what counts as a press
 * *inside* — and hands back the state, so the caller can redraw the body from
 * fresh data without the reader losing their place.
 *
 * Null where nothing is open, or where what is open belongs to another control.
 * A caller that gets null draws no panel, which is how a cell that was not open
 * stays closed.
 */
export function reanchorAnchoredPanel<S>(
	key: string,
	anchor: HTMLElement,
): AnchoredPanel<S> | null {
	if (openPanel === null || openKey !== key) return null;
	const el = openPanel;
	openAnchor = anchor;
	const body = el.querySelector<HTMLElement>('.sheetsmith-panel-body');
	if (body === null) return null;
	return {
		body,
		state: openState as S,
		place: () => placeAnchored(el, anchor),
		close: () => {
			closeAnchoredPanel();
			anchor.focus();
		},
	};
}

/**
 * Close an open panel whose control is no longer on the page.
 *
 * The other half of re-anchoring, and the host calls it once after a rebuild: a
 * render that no longer draws the cell the panel belonged to — the file changed,
 * the layout changed, the row went — leaves a panel anchored to a detached
 * element, which would then float over a sheet it has nothing to do with.
 */
export function dropDetachedAnchoredPanel(): void {
	if (openPanel === null) return;
	if (openAnchor !== null && openAnchor.isConnected) return;
	closeAnchoredPanel();
}

/** Every element inside `root` a keyboard can land on, in document order. */
function focusable(root: HTMLElement): HTMLElement[] {
	return Array.from(
		root.querySelectorAll<HTMLElement>(
			'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
		),
	).filter((el) => el.getAttribute('aria-hidden') !== 'true');
}

/**
 * Open a panel under `anchor`, labelled `label`, and hand back its body.
 *
 * **`role="dialog"` with a label naming the row**, and the focus cycle is the
 * platform's own contract for one — which is also what makes
 * `aria-haspopup="dialog"` on the control true rather than decorative. Focus moves
 * to the first control on open, Tab and Shift+Tab cycle within, and Escape closes
 * and returns focus to the anchor.
 *
 * **Scroll repositions rather than dismissing**, which is the one departure from
 * `showPopover`'s regime and it is argued: a bubble is a thing you read, so a
 * scroll means you have moved on, while a form is a thing you are filling in and a
 * table scrolls inside its own overflow box under the smallest wheel gesture.
 *
 * `onClose` runs whenever it closes for any reason, which is what lets a caller
 * put `aria-expanded` back.
 */
export function showAnchoredPanel<S>(
	anchor: HTMLElement,
	label: string,
	/** What identifies this panel across a rebuild of whatever drew the anchor. */
	key: string,
	/** The opener's own posture, handed back by `reanchorAnchoredPanel`. */
	state: S,
	onClose?: () => void,
): AnchoredPanel<S> {
	const doc = anchor.ownerDocument;
	const view = doc.defaultView;
	closeAnchoredPanel();

	const el = doc.createElement('div');
	el.className = 'sheetsmith-panel';
	el.id = `sheetsmith-panel-${++counter}`;
	el.setAttribute('role', 'dialog');
	el.setAttribute('aria-label', label);
	const body = doc.createElement('div');
	body.className = 'sheetsmith-panel-body';
	el.appendChild(body);
	doc.body.appendChild(el);

	const place = () => placeAnchored(el, anchor);
	place();

	const close = () => {
		closeAnchoredPanel();
		// Focus goes back where the reader left it, which is the half of Escape a
		// keyboard reader will try first.
		anchor.focus();
	};

	/** A press anywhere outside, in capture, so a swallowed press still counts. */
	const onPointerDown = (event: Event) => {
		const target = event.target;
		if (target instanceof Node && (el.contains(target) || anchor.contains(target))) {
			return;
		}
		closeAnchoredPanel();
	};
	const onKey = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
			return;
		}
		if (event.key !== 'Tab') return;
		/*
		 * **The cycle is owed rather than inherited**, because the panel is appended
		 * to `document.body` and so is nowhere near the anchor in DOM order: without
		 * this, Tab out of the last field lands on whatever follows the sheet's own
		 * last control, which is somewhere the reader was not.
		 */
		const stops = focusable(el);
		if (stops.length === 0) return;
		const first = stops[0] as HTMLElement;
		const last = stops[stops.length - 1] as HTMLElement;
		const active = doc.activeElement;
		if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		} else if (event.shiftKey && (active === first || !el.contains(active))) {
			event.preventDefault();
			last.focus();
		}
	};

	doc.addEventListener('pointerdown', onPointerDown, true);
	doc.addEventListener('keydown', onKey, true);
	view?.addEventListener('scroll', place, true);
	view?.addEventListener('resize', place);

	unhook = () => {
		doc.removeEventListener('pointerdown', onPointerDown, true);
		doc.removeEventListener('keydown', onKey, true);
		view?.removeEventListener('scroll', place, true);
		view?.removeEventListener('resize', place);
		onClose?.();
	};
	openPanel = el;
	openKey = key;
	openState = state;
	openAnchor = anchor;

	return { body, state, place, close };
}

/**
 * Move focus to the first control inside an open panel.
 *
 * Separate from opening, because the caller fills the body *after* the panel
 * exists: focusing at open time would find nothing to focus.
 */
export function focusFirstControl(panel: AnchoredPanel<unknown>): void {
	focusable(panel.body)[0]?.focus();
}
