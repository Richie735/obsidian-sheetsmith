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

/**
 * Follow a link, wherever the anchor came from.
 *
 * The press belongs to the link and not to the box behind it, which is PATTERNS
 * §6's rule that a real control owns its own presses — and `stopPropagation` is
 * load-bearing rather than tidy, because in a Rich text block the layer under the
 * anchor answers presses by focusing the field.
 */
function followLink(
	event: MouseEvent,
	target: string,
	link: LinkContext | undefined,
): void {
	event.preventDefault();
	event.stopPropagation();
	link?.open(target, event);
}

/**
 * Offer an anchor to whatever draws hover previews.
 *
 * The Page preview plugin owns the popover and owns whether the user asked for
 * one at all, so this only makes the offer.
 */
function offerPreview(
	event: MouseEvent,
	target: string,
	anchor: HTMLElement,
	link: LinkContext | undefined,
): void {
	link?.preview(target, anchor, event);
}

/**
 * Give the links inside `container` this module's behaviour, for anchors this
 * module did not draw.
 *
 * **The app's renderer produces its own anchors, and nothing was listening to
 * them.** `paintLinkedText` wires each anchor as it paints it, and it only runs
 * on the *fallback* path — the one with no app. So a wikilink worked in a unit
 * test and in the harness and was dead in Obsidian, which is exactly inverted,
 * and it was invisible because every criterion covering links was written against
 * the fallback. External links went on working throughout, because those are
 * Electron's to open and never this plugin's.
 *
 * Delegated rather than wired per anchor, and that is the difference forced by
 * not owning the paint: the renderer is asynchronous and may replace what it drew,
 * so there is no moment at which the anchors are all present to walk. One listener
 * on the container outlives every repaint underneath it.
 *
 * **Internal links only.** `a.internal-link[data-href]` is what Obsidian's own
 * renderer marks a wikilink with, and an external link must fall straight through
 * — intercepting `https://` here would take a working link and route it at a
 * vault that has no such note.
 *
 * The anchors themselves need almost nothing: the renderer writes `internal-link`
 * and `data-href`, so this adopts rather than repaints. **It does not write the
 * resolution state**, though — that came back as a second report once the presses
 * worked, and {@link markRenderedResolution} is the other half.
 */
export function adoptRenderedLinks(
	container: HTMLElement,
	link: LinkContext | undefined,
): void {
	/** The internal anchor a pointer event happened inside, if any. */
	const anchorOf = (event: Event): HTMLElement | null => {
		const from = event.target;
		if (!(from instanceof HTMLElement)) return null;
		return from.closest<HTMLElement>('a.internal-link[data-href]');
	};

	container.addEventListener('click', (event) => {
		const anchor = anchorOf(event);
		if (anchor === null) return;
		// `data-href` and never `href`: the app writes the raw target into the
		// first and may put a resolved or empty value in the second.
		followLink(event, anchor.getAttribute('data-href') ?? '', link);
	});

	container.addEventListener('mouseover', (event) => {
		const anchor = anchorOf(event);
		if (anchor === null) return;
		offerPreview(event, anchor.getAttribute('data-href') ?? '', anchor, link);
	});
}

/**
 * Mark which of the links inside `container` name notes the vault does not hold.
 *
 * **`MarkdownRenderer.render` does not do this**, which is the second half of the
 * same surprise as the presses: a detached render produces `a.internal-link` with
 * no `is-unresolved` on it, because the class is applied by the app's own preview
 * machinery and not by the render call. So every link in a backstory painted as
 * live, whether or not the note existed — and an inventory of things with no notes
 * yet is the ordinary case, which is exactly the lie `paintLinkedText` refuses to
 * tell on the fallback path.
 *
 * Idempotent, and it clears as well as sets: the same container is re-marked after
 * every render, and a note created since the last one has to stop being dimmed.
 *
 * Separate from {@link adoptRenderedLinks} because the two need different moments.
 * A press can be delegated and bound before anything exists; a *class* has to be
 * put on an anchor that is already there, and the renderer is asynchronous — so
 * this is called by whoever knows the render has landed.
 */
export function markRenderedResolution(
	container: HTMLElement,
	resolves: (target: string) => boolean,
): void {
	const anchors = container.querySelectorAll<HTMLElement>(
		'a.internal-link[data-href]',
	);
	// `forEach` rather than `for…of`: the DOM lib this project targets types a
	// `NodeListOf` without `Symbol.iterator`.
	anchors.forEach((anchor) => {
		const target = anchor.getAttribute('data-href') ?? '';
		anchor.classList.toggle('is-unresolved', !resolves(target));
	});
}

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
		anchor.addEventListener('click', (event) => followLink(event, target, link));
		anchor.addEventListener('mouseover', (event) => {
			offerPreview(event, target, anchor, link);
		});
		if (clipping !== undefined && display === target) clipping.reveal(anchor);
		into.appendChild(anchor);
	}
}
