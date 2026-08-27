/*
 * Text with its wikilinks drawn as links: the anchor policy, in one place.
 *
 * The anchor is Obsidian's own markup — `internal-link`, `is-unresolved`, and
 * both `href` and `data-href` — so it takes the user's theme and whatever a
 * theme or another plugin does to links, rather than a colour of this plugin's
 * (`docs/UI.md` §1). Nothing app-shaped is needed to draw one; a `LinkContext`
 * is what makes it resolve, open and preview, and without one the link paints
 * and a press does nothing, which is the truth when there is no vault behind it.
 *
 * **Two consumers, and it is extracted anyway.** PATTERNS §1's ladder shares on
 * the third consumer and allows duplication at two under a test driving both
 * copies — except where the duplicated thing is a *policy*, which climbs in one
 * step. This is a policy and nothing else: which classes an anchor carries,
 * that both link attributes are written, that a differing alias earns a `title`
 * and never an `aria-label`, that a press belongs to the link and not to the box
 * behind it, and that a link paints as resolved where there is no vault. Drift
 * between two copies of that set is the entire risk, and a guard test could only
 * assert they still spell the same thing — which is what one name says for free.
 *
 * This lived in `table.ts` as a private `paintText`, whose own header named Rich
 * text as the second consumer and said it would move when one arrived.
 *
 * **What did not move is clipping**, and the split is deliberate. A table cell
 * is one line in a row whose height its neighbours already agreed, so it clips
 * and the ellipsis has an owner; a Rich text block wraps and scrolls, so it
 * clips nothing. Clipping is therefore a caller's concern, passed in as one
 * option so a caller that does not clip omits it whole — and the class name
 * stays with the caller, which is PATTERNS §1's rule from the pool's gesture
 * engine: a module beside the components is handed
 * `'sheetsmith-table-link-only'` rather than naming a table itself.
 */

import { parseLinks } from '../parse/wikilink';
import { LinkContext } from '../types';

/** What a caller whose box clips its text does about a link inside it. */
export interface LinkClipping {
	/**
	 * Marked on the container while the whole text is one link and nothing
	 * else, which is what decides who paints the ellipsis.
	 *
	 * Marked rather than left to `a:only-child`, which counts element children
	 * only: a cell of prose *and* one link matched it, the anchor became a
	 * block, and "in Bag of Holding" broke onto two lines.
	 */
	soleLinkClass: string;
	/**
	 * Called for each anchor that shows its own target, so the caller can offer
	 * the rest of a clipped one.
	 *
	 * Only those: an aliased link already carries a `title` naming its target,
	 * and two tooltips on one anchor is worse than either.
	 */
	reveal: (anchor: HTMLElement) => void;
}

export interface LinkedTextOptions {
	/**
	 * The vault half of a link. Absent paints every link as resolved: a missing
	 * vault is not evidence that a note is missing.
	 */
	link?: LinkContext;
	/** Absent where the caller's box wraps rather than clipping. */
	clipping?: LinkClipping;
}

/** Draw text into an element, with any wikilink in it as a link. */
export function paintLinkedText(
	into: HTMLElement,
	text: string,
	options: LinkedTextOptions,
): void {
	const doc = into.ownerDocument;
	const { link, clipping } = options;
	into.replaceChildren();
	const segments = parseLinks(text);
	if (clipping !== undefined) {
		into.classList.toggle(
			clipping.soleLinkClass,
			segments.length === 1 && segments[0]?.kind === 'link',
		);
	}
	for (const segment of segments) {
		if (segment.kind === 'text') {
			into.appendChild(doc.createTextNode(segment.text));
			continue;
		}
		const { target, display } = segment;
		const anchor = doc.createElement('a');
		anchor.classList.add('internal-link');
		// An inventory of things that have no notes yet is the ordinary case, and
		// painting them as live links would be a lie the theme already has a
		// colour for. Absent a context every link paints as resolved.
		if (link !== undefined && !link.resolves(target)) {
			anchor.classList.add('is-unresolved');
		}
		// Both, because that is what Obsidian's own markup carries and what
		// anything styling or intercepting links looks for.
		anchor.setAttribute('href', target);
		anchor.setAttribute('data-href', target);
		anchor.textContent = display;
		// An aliased link shows the alias, so the target is otherwise nowhere on
		// the sheet. Only where the two differ: a tooltip repeating text that is
		// already legible is noise fired at every pass, which is the lesson the
		// card's label learned.
		//
		// **`title`, not `aria-label`**, and that is a correction rather than a
		// preference. `aria-label` is what Obsidian's own aliased links carry, and
		// what its tooltip reads, but it *replaces* the name computed from the
		// element's contents: a link reading "sword" announced as "Sunblade" is a
		// name that appears nowhere in the text, which fails WCAG 2.5.3 (label in
		// name, level A) and leaves voice control with nothing to match when the
		// user says "click sword". `title` is supplementary instead — the name
		// stays "sword" and the target is announced after it as the description, so
		// a listener gets both. The cost is the browser's tooltip rather than the
		// app's styled one, which is also what every other tooltip on this sheet
		// uses: the level ring's name, a computed cell's formula, a clipped value.
		if (display !== target) anchor.setAttribute('title', target);
		anchor.addEventListener('click', (event) => {
			// The press belongs to the link, not to the box behind it: PATTERNS §6
			// has this rule, that a real control owns its own presses.
			event.preventDefault();
			event.stopPropagation();
			link?.open(target, event);
		});
		// The Page preview plugin owns the popover and owns whether the user
		// asked for one at all, so this only offers the anchor to it.
		anchor.addEventListener('mouseover', (event) => {
			link?.preview(target, anchor, event);
		});
		if (clipping !== undefined && display === target) clipping.reveal(anchor);
		into.appendChild(anchor);
	}
}
