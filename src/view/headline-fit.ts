/*
 * The view's pass that keeps every headline's cut state true as the sheet is
 * resized (`docs/features/headline-narrow-cell.md`, "The fit check").
 *
 * After `renderGrid`, in the view and the harness alike, which is why this
 * imports nothing from `obsidian` (`placement-decorations.ts`'s arrangement).
 * A component stamps its headline and refits it when it sets a value in code;
 * what a component cannot see is its card being narrowed, by a split dragged
 * or a pane resized, which changes no value. So one `ResizeObserver` per view
 * watches every stamped headline and refits each one whose box changed.
 *
 * **The first `ResizeObserver` in the repository, so its lifecycle is the
 * rule** (`docs/PATTERNS.md` §5): one per view, owned by the view, observing
 * what one render stamped, and disconnected before the next render and when
 * the view closes, so no observer outlives what it watched. `refitHeadline`
 * sets a state and never a size, which is what makes calling it from a resize
 * callback safe: it cannot resize what it observes.
 */

import { HEADLINE_CLASS, refitHeadline } from '../ui/headline-fit';

/** The constructor a window offers, where it offers one. */
type ObserverConstructor = new (callback: ResizeObserverCallback) => ResizeObserver;

/** The pass one view owns. */
export interface HeadlineFit {
	/**
	 * Refit and observe every headline under `root`, dropping whatever the
	 * render before this one observed. Called after every render.
	 */
	watch(root: HTMLElement): void;
	/** Refit every headline watched now, without waiting for a resize. */
	refitAll(): void;
	/** Stop observing. Called before a rebuild empties the sheet, and on close. */
	disconnect(): void;
}

/**
 * The pass for one view. `Observer` is the window's own `ResizeObserver`,
 * passed in so a popout window's is used and a test can hand in a stub; where
 * there is none, `watch` still refits once and observes nothing.
 */
export function createHeadlineFit(Observer: ObserverConstructor | undefined): HeadlineFit {
	let watched: HTMLElement[] = [];
	/**
	 * Made on the first render that stamps a headline and kept for the view's
	 * life: a disconnected observer observes again, so a rebuild needs no
	 * second one.
	 */
	let observer: ResizeObserver | null = null;
	const refitAll = () => {
		for (const el of watched) refitHeadline(el);
	};
	const disconnect = () => {
		observer?.disconnect();
		watched = [];
	};
	return {
		watch(root) {
			disconnect();
			watched = Array.from(root.querySelectorAll<HTMLElement>(`.${HEADLINE_CLASS}`));
			refitAll();
			if (Observer === undefined || watched.length === 0) return;
			observer ??= new Observer((entries) => {
				for (const entry of entries) refitHeadline(entry.target as HTMLElement);
			});
			for (const el of watched) observer.observe(el);
		},
		refitAll,
		disconnect,
	};
}

/** The `ResizeObserver` of the window `el` lives in, if it has one. */
export function resizeObserverOf(el: HTMLElement): ObserverConstructor | undefined {
	const win = el.ownerDocument.defaultView as { ResizeObserver?: ObserverConstructor } | null;
	return win?.ResizeObserver;
}
