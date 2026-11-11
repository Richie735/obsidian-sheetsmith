/*
 * A link shaped as Obsidian's own renderer draws one, for tests of the path
 * where the app painted the anchor and the plugin did not.
 *
 * **That path is the whole class of bug.** `paintLinkedText` wires each anchor
 * it paints, and the app's renderer paints its own, so a link that worked in a
 * unit test was dead in Obsidian, in Rich text and again in a Stat block's
 * features. A test proving the adoption works needs an anchor the
 * fallback did not draw, and one spelling of it, so the fake cannot drift from
 * the app's markup in one file and not another.
 */

/**
 * Append an anchor to `into` as the app's renderer marks a link: an internal
 * one is `a.internal-link` carrying `href` and `data-href`, an external one
 * `a.external-link` carrying `href` alone. Returns the anchor.
 */
export function appRenderedLink(
	into: HTMLElement,
	target: string,
	options: { external?: boolean } = {},
): HTMLAnchorElement {
	const anchor = into.ownerDocument.createElement('a');
	anchor.setAttribute('href', target);
	// `className` rather than `classList.add`, for `external-link`:
	// `styles.test.ts` scans every `.ts` under `src/` for the plugin claiming an
	// unprefixed class, and that one is not on its `BORROWED` list. A fake of
	// the app's output is no reason to widen it. (`internal-link` is on it.)
	anchor.className = options.external === true ? 'external-link' : 'internal-link';
	if (options.external !== true) anchor.setAttribute('data-href', target);
	anchor.textContent = target;
	into.appendChild(anchor);
	return anchor;
}

/**
 * A `renderMarkdown` that draws what the app would for every wikilink in the
 * markdown, one anchor each, and nothing else.
 */
export function rendersLinks(markdown: string, into: HTMLElement): void {
	into.replaceChildren();
	for (const match of markdown.matchAll(/\[\[([^\]|]+)[^\]]*\]\]/g)) {
		appRenderedLink(into, match[1] ?? '');
	}
}
